import { contextBridge, ipcRenderer } from 'electron'
import type { Api, UpdateStatus } from '../shared/types'

const api: Api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveHost: (host) => ipcRenderer.invoke('host:save', host),
  deleteHost: (id) => ipcRenderer.invoke('host:delete', id),
  saveProjects: (projects) => ipcRenderer.invoke('projects:save', projects),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  testHost: (baseUrl, token, hostId) => ipcRenderer.invoke('host:test', baseUrl, token, hostId),
  request: (hostId, path, query) => ipcRenderer.invoke('gitlab:request', hostId, path, query),
  saveCsv: (defaultName, content) => ipcRenderer.invoke('file:saveCsv', defaultName, content),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  notify: (title, body) => ipcRenderer.send('notify', title, body),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: UpdateStatus) => cb(s)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
