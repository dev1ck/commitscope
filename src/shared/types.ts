export interface HostConfig {
  id: string
  name: string
  baseUrl: string
  hasToken: boolean
}

/** token이 undefined이면 기존 토큰을 유지한다 */
export interface HostInput {
  id?: string
  name: string
  baseUrl: string
  token?: string
}

export interface ProjectConfig {
  /** `${hostId}:${id}` */
  key: string
  hostId: string
  id: number
  name: string
  pathWithNamespace: string
  webUrl: string
  defaultBranch: string
}

export interface Settings {
  /** 0 = 끄기 */
  autoRefreshSec: number
}

export interface AppConfig {
  hosts: HostConfig[]
  projects: ProjectConfig[]
  settings: Settings
}

export type Query = Record<string, string | number | boolean | undefined>

export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
  nextPage?: number
}

export interface Api {
  getConfig(): Promise<AppConfig>
  saveHost(host: HostInput): Promise<AppConfig>
  deleteHost(id: string): Promise<AppConfig>
  saveProjects(projects: ProjectConfig[]): Promise<AppConfig>
  saveSettings(settings: Settings): Promise<AppConfig>
  testHost(baseUrl: string, token: string, hostId?: string): Promise<ApiResult<{ username: string; name: string }>>
  request<T>(hostId: string, path: string, query?: Query): Promise<ApiResult<T>>
  saveCsv(defaultName: string, content: string): Promise<boolean>
  openExternal(url: string): Promise<void>
  notify(title: string, body: string): void
}
