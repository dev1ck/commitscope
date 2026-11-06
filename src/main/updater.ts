import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

/** 설치 파일이 올라가는 공개 릴리스 저장소 (package.json build.publish와 같아야 한다) */
const RELEASES_REPO = 'dev1ck/commitscope'
const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** portable exe는 자동 설치를 지원하지 않아 알림 + 다운로드 페이지 연결만 한다 */
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR

let status: UpdateStatus = { state: 'idle' }

function send(s: UpdateStatus): void {
  status = s
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', s)
}

const newer = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

async function checkPortable(): Promise<void> {
  const res = await net.fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`)
  if (!res.ok) return
  const version = String(((await res.json()) as { tag_name?: string }).tag_name ?? '').replace(/^v/, '')
  if (version && newer(version, app.getVersion())) send({ state: 'available', version, manual: true })
}

function check(): void {
  if (status.state === 'downloading' || status.state === 'downloaded') return
  if (isPortable) checkPortable().catch(() => {})
  else autoUpdater.checkForUpdates().catch(() => {})
}

export function setupUpdater(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:install', async () => {
    if (status.state !== 'available' && status.state !== 'error') return
    if (status.state === 'available' && status.manual) {
      await shell.openExternal(RELEASES_PAGE)
      return
    }
    send({ state: 'downloading', version: status.version, percent: 0 })
    autoUpdater.downloadUpdate().catch((e: Error) => {
      if (status.state === 'downloading') send({ state: 'error', version: status.version, message: e.message })
    })
  })

  // 개발 실행(npm run dev)에서는 확인하지 않는다
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') send({ ...status, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'downloaded', version: info.version })
    // 사용자가 이미 [지금 업데이트]를 눌렀으므로 바로 조용히 설치하고 다시 실행한다
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 800)
  })
  autoUpdater.on('error', (e) => {
    // 백그라운드 확인 실패(오프라인 등)는 조용히 넘기고, 사용자가 시작한 다운로드 실패만 알린다
    if (status.state === 'downloading') send({ state: 'error', version: status.version, message: e.message })
  })

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
