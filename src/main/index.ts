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

const encryptToken = (token: string): string => safeStorage.encryptString(token).toString('base64')
const decryptToken = (enc?: string): string => (enc ? safeStorage.decryptString(Buffer.from(enc, 'base64')) : '')

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

function registerIpc(): void {
  ipcMain.handle('config:get', async () => toPublic(await loadConfig()))

  ipcMain.handle('host:save', async (_e, input: HostInput) => {
    const cfg = await loadConfig()
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
    const existing = input.id ? cfg.hosts.find((h) => h.id === input.id) : undefined
    if (existing) {
      existing.name = input.name.trim()
      existing.baseUrl = baseUrl
      if (input.token) existing.tokenEnc = encryptToken(input.token.trim())
    } else {
      cfg.hosts.push({
        id: randomUUID(),
        name: input.name.trim(),
        baseUrl,
        tokenEnc: input.token ? encryptToken(input.token.trim()) : undefined
      })
    }
    await saveConfig(cfg)
    return toPublic(cfg)
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

  ipcMain.handle('host:test', async (_e, baseUrl: string, token: string, hostId?: string) => {
    let t = token.trim()
    if (!t && hostId) {
      const cfg = await loadConfig()
      t = decryptToken(cfg.hosts.find((h) => h.id === hostId)?.tokenEnc)
    }
    return gitlabFetch(baseUrl, t, '/user')
  })

  ipcMain.handle('gitlab:request', async (_e, hostId: string, path: string, query?: Query) => {
    const cfg = await loadConfig()
    const host = cfg.hosts.find((h) => h.id === hostId)
    if (!host) return { ok: false, status: 0, error: 'GitLab 서버 설정을 찾을 수 없습니다.' }
    return gitlabFetch(host.baseUrl, decryptToken(host.tokenEnc), path, query)
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
