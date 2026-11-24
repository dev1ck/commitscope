import { app, BrowserWindow, dialog, ipcMain, net, Notification, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ApiResult, AppConfig, HostInput, ProjectConfig, Query, Settings } from '../shared/types'
import { setupUpdater } from './updater'

interface StoredHost {
  id: string
  name: string
  baseUrl: string
  /** safeStorage(DPAPI)로 암호화한 PAT, base64 */
  tokenEnc?: string
}

interface StoredConfig {
  hosts: StoredHost[]
  projects: ProjectConfig[]
  settings: Settings
}

const configPath = (): string => join(app.getPath('userData'), 'config.json')

async function loadConfig(): Promise<StoredConfig> {
  const empty: StoredConfig = { hosts: [], projects: [], settings: { autoRefreshSec: 60 } }
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'))
    return { ...empty, ...raw, settings: { ...empty.settings, ...raw.settings } }
  } catch {
    return empty
  }
}

async function saveConfig(cfg: StoredConfig): Promise<void> {
  const tmp = configPath() + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  await fs.rename(tmp, configPath())
}

function toPublic(cfg: StoredConfig): AppConfig {
  return {
    hosts: cfg.hosts.map(({ tokenEnc, ...h }) => ({ ...h, hasToken: !!tokenEnc })),
    projects: cfg.projects,
    settings: cfg.settings
  }
}

const encryptToken = async (token: string): Promise<string> => (await safeStorage.encryptStringAsync(token)).toString('base64')

async function decryptToken(enc?: string): Promise<string> {
  if (!enc) return ''
  const encrypted = Buffer.from(enc, 'base64')
  const decrypted = await safeStorage.decryptStringAsync(encrypted)
  return decrypted.shouldReEncrypt ? (await safeStorage.decryptStringAsync(encrypted)).result : decrypted.result
}

async function gitlabFetch<T>(baseUrl: string, token: string, path: string, query?: Query): Promise<ApiResult<T>> {
  try {
    const url = new URL(baseUrl.replace(/\/+$/, '') + '/api/v4' + path)
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
    // net.fetch는 Chromium 네트워크 스택을 사용하므로 Windows 인증서 저장소/시스템 프록시를 따른다
    const res = await net.fetch(url.toString(), { headers: token ? { 'PRIVATE-TOKEN': token } : {} })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      data = undefined
    }
    if (!res.ok) {
      const body = data as { message?: unknown; error?: unknown } | undefined
      const raw = body?.message ?? body?.error ?? text.slice(0, 200)
      const msg = typeof raw === 'string' ? raw : JSON.stringify(raw)
      return { ok: false, status: res.status, error: msg.startsWith(String(res.status)) ? msg : `${res.status} ${msg}` }
    }
    const next = res.headers.get('x-next-page')
    return { ok: true, status: res.status, data: data as T, nextPage: next ? Number(next) : undefined }
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message }
  }
}

interface GitLabAccount {
  username: string
  name: string
}

type HostError = { ok: false; status: number; error: string }
type HostCheck = { ok: true; status: number; baseUrl: string; account: GitLabAccount } | HostError

const hostError = (status: number, error: string): HostError => ({ ok: false, status, error })

function readHostAccount(baseUrl: string, status: number, contentType: string, text: string): HostCheck {
  const wrongUrl = 'GitLab API를 찾을 수 없습니다. 프로젝트 링크를 붙여넣었다면 GitLab 기본 URL을 입력하세요.'
  const isHtml = /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType) || /^\s*(?:<!doctype html|<html[\s>])/i.test(text)
  if (status === 404 || isHtml) return hostError(status, wrongUrl)
  if (status === 401) return hostError(401, 'GitLab 인증에 실패했습니다. 토큰 값과 만료 여부를 확인하세요.')
  if (status === 403) return hostError(403, 'GitLab API 접근이 거부되었습니다. 토큰의 read_api 권한과 계정 접근 권한을 확인하세요.')
  if (status < 200 || status >= 300) return hostError(status, `GitLab 서버에서 HTTP ${status} 오류를 반환했습니다.`)

  try {
    const account = JSON.parse(text) as Partial<GitLabAccount> | null
    const username = typeof account?.username === 'string' ? account.username.trim() : ''
    if (!username) return hostError(status, wrongUrl)
    const name = (typeof account?.name === 'string' && account.name.trim()) || username
    return { ok: true, status, baseUrl, account: { username, name } }
  } catch {
    return hostError(status, wrongUrl)
  }
}

function requestHostAccount(baseUrl: string, token: string): Promise<HostCheck> {
  return new Promise((resolve) => {
    const request = net.request({ url: `${baseUrl}/api/v4/user`, redirect: 'manual', cache: 'no-store' })
    request.setHeader('PRIVATE-TOKEN', token)
    const timeout = setTimeout(() => {
      finish(hostError(0, 'GitLab 서버 응답 시간이 초과되었습니다. URL과 네트워크 연결을 확인하세요.'))
      request.abort()
    }, 10_000)
    const finish = (result: HostCheck) => {
      clearTimeout(timeout)
      resolve(result)
    }
    const connectionFailed = () => finish(hostError(0, 'GitLab 서버에 연결할 수 없습니다. URL과 네트워크 연결을 확인하세요.'))
    request.once('error', connectionFailed)
    request.once('redirect', (status) => {
      finish(hostError(status, '다른 주소로 이동했습니다. 브라우저에서 GitLab 기본 URL을 확인해 입력하세요.'))
    })
    request.once('response', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.once('error', connectionFailed)
      response.once('aborted', connectionFailed)
      response.once('end', () => {
        const contentType = String(response.headers['content-type'] ?? '')
        finish(readHostAccount(baseUrl, response.statusCode, contentType, Buffer.concat(chunks).toString('utf8')))
      })
    })
    request.end()
  })
}

async function validateHost(rawUrl: string, token: string, existing?: StoredHost): Promise<HostCheck> {
  const input = rawUrl.trim()
  const url = URL.parse(input)
  if (!/^https?:\/\//i.test(input) || !url || !url.hostname || url.username || url.password || url.search || url.hash) {
    return hostError(400, 'http:// 또는 https://로 시작하는 GitLab 기본 URL을 입력하세요. 예: https://gitlab.example.com')
  }

  const baseUrl = url.origin + url.pathname.replace(/\/+$/, '')
  if (!token && existing?.tokenEnc) {
    if (URL.parse(existing.baseUrl)?.origin !== url.origin) {
      return hostError(400, '서버 주소가 변경되었습니다. 새 서버의 Personal Access Token을 입력하세요.')
    }
    try {
      token = await decryptToken(existing.tokenEnc)
    } catch {
      return hostError(400, '저장된 토큰을 읽을 수 없습니다. Personal Access Token을 다시 입력하세요.')
    }
  }
  if (!token) return hostError(400, 'Personal Access Token을 입력하세요.')

  return requestHostAccount(baseUrl, token)
}

function registerIpc(): void {
  ipcMain.handle('config:get', async () => toPublic(await loadConfig()))

  ipcMain.handle('host:save', async (_e, input: HostInput): Promise<ApiResult<AppConfig>> => {
    const name = input.name.trim()
    if (!name) return hostError(400, '서버 이름을 입력하세요.')
    const token = input.token?.trim() ?? ''
    const previous = input.id ? (await loadConfig()).hosts.find((h) => h.id === input.id) : undefined
    if (input.id && !previous) return hostError(404, '편집할 서버 설정을 찾을 수 없습니다.')
    const validation = await validateHost(input.baseUrl, token, previous)
    if (!validation.ok) return validation

    const tokenEnc = token ? await encryptToken(token) : undefined
    const cfg = await loadConfig()
    if (previous) {
      const existing = cfg.hosts.find((h) => h.id === previous.id)
      if (!existing || existing.baseUrl !== previous.baseUrl || existing.tokenEnc !== previous.tokenEnc) {
        return hostError(409, '연결 확인 중 서버 설정이 변경되었습니다. 서버 설정을 다시 열어 주세요.')
      }
      existing.name = name
      existing.baseUrl = validation.baseUrl
      if (tokenEnc) existing.tokenEnc = tokenEnc
    } else {
      cfg.hosts.push({
        id: randomUUID(),
        name,
        baseUrl: validation.baseUrl,
        tokenEnc
      })
    }
    await saveConfig(cfg)
    return { ok: true, status: validation.status, data: toPublic(cfg) }
  })

  ipcMain.handle('host:delete', async (_e, id: string) => {
    const cfg = await loadConfig()
    cfg.hosts = cfg.hosts.filter((h) => h.id !== id)
    cfg.projects = cfg.projects.filter((p) => p.hostId !== id)
    await saveConfig(cfg)
    return toPublic(cfg)
  })

  ipcMain.handle('projects:save', async (_e, projects: ProjectConfig[]) => {
    const cfg = await loadConfig()
    cfg.projects = projects
    await saveConfig(cfg)
    return toPublic(cfg)
  })

  ipcMain.handle('settings:save', async (_e, settings: Settings) => {
    const cfg = await loadConfig()
    cfg.settings = settings
    await saveConfig(cfg)
    return toPublic(cfg)
  })

  ipcMain.handle('host:test', async (_e, baseUrl: string, token: string, hostId?: string): Promise<ApiResult<GitLabAccount>> => {
    const existing = hostId && !token.trim() ? (await loadConfig()).hosts.find((h) => h.id === hostId) : undefined
    const validation = await validateHost(baseUrl, token.trim(), existing)
    return validation.ok ? { ok: true, status: validation.status, data: validation.account } : validation
  })

  ipcMain.handle('gitlab:request', async (_e, hostId: string, path: string, query?: Query) => {
    const cfg = await loadConfig()
    const host = cfg.hosts.find((h) => h.id === hostId)
    if (!host) return { ok: false, status: 0, error: 'GitLab 서버 설정을 찾을 수 없습니다.' }
    return gitlabFetch(host.baseUrl, await decryptToken(host.tokenEnc), path, query)
  })

  ipcMain.handle('file:saveCsv', async (e, defaultName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return false
    // Excel에서 한글이 깨지지 않도록 UTF-8 BOM 추가
    await fs.writeFile(r.filePath, '﻿' + content, 'utf8')
    return true
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.on('notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1000,
    minHeight: 600,
    title: 'Commitscope',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.setAppUserModelId('local.commitscope')

if (!app.isPackaged) {
  // 개발 실행은 설치본과 설정 경로를 공유한다. 디스크 캐시 파일을 동시에 열지 않도록 한다.
  app.commandLine.appendSwitch('disable-http-cache')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  setupUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
