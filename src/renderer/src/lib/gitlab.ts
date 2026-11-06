import type { ProjectConfig, Query } from '../../../shared/types'

export interface Commit {
  id: string
  short_id: string
  title: string
  message: string
  author_name: string
  author_email: string
  authored_date: string
  committer_name: string
  committer_email: string
  committed_date: string
  parent_ids: string[]
  web_url: string
  stats?: { additions: number; deletions: number; total: number }
}

export interface RefInfo {
  name: string
  sha: string
  type: 'branch' | 'tag'
  isDefault?: boolean
}

export interface CommitRef {
  type: 'branch' | 'tag'
  name: string
}

export interface MergeRequest {
  iid: number
  title: string
  state: string
  web_url: string
  source_branch: string
  target_branch: string
}

export interface FileDiff {
  diff: string
  new_path: string
  old_path: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  too_large?: boolean
  collapsed?: boolean
}

export interface GitLabProject {
  id: number
  name: string
  path_with_namespace: string
  web_url: string
  default_branch?: string
  description?: string | null
  last_activity_at?: string
}

export type QueryMode = 'all' | 'ref' | 'range'

export interface CommitQuery {
  mode: QueryMode
  ref: string
  from: string
  to: string
  /** YYYY-MM-DD */
  since: string
  until: string
  author: string
  path: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function call<T>(hostId: string, path: string, query?: Query): Promise<{ data: T; nextPage?: number }> {
  const r = await window.api.request<T>(hostId, path, query)
  if (!r.ok) throw new ApiError(r.error ?? '요청 실패', r.status)
  return { data: r.data as T, nextPage: r.nextPage }
}

const proj = (p: ProjectConfig, path: string): string => `/projects/${p.id}${path}`

async function paginate<T>(fetchPage: (page: number) => Promise<{ data: T[]; nextPage?: number }>, maxPages = 20): Promise<T[]> {
  const out: T[] = []
  let page: number | undefined = 1
  for (let i = 0; i < maxPages && page; i++) {
    const r = await fetchPage(page)
    out.push(...r.data)
    page = r.nextPage
  }
  return out
}

export const PAGE_SIZE = 100

export function commitParams(q: CommitQuery): Query {
  const params: Query = { per_page: PAGE_SIZE, order: 'topo' }
  if (q.mode === 'all') params.all = true
  else if (q.mode === 'ref') params.ref_name = q.ref || undefined
  else params.ref_name = `${q.from}..${q.to}`
  if (q.since) params.since = new Date(`${q.since}T00:00:00`).toISOString()
  if (q.until) params.until = new Date(`${q.until}T23:59:59`).toISOString()
  if (q.author.trim()) params.author = q.author.trim()
  if (q.path.trim()) params.path = q.path.trim()
  return params
}

export const listCommits = (p: ProjectConfig, q: CommitQuery, page: number) =>
  call<Commit[]>(p.hostId, proj(p, '/repository/commits'), { ...commitParams(q), page })

export async function listRefs(p: ProjectConfig): Promise<RefInfo[]> {
  type B = { name: string; default: boolean; commit: { id: string } }
  type T = { name: string; commit: { id: string } }
  const [branches, tags] = await Promise.all([
    paginate((page) => call<B[]>(p.hostId, proj(p, '/repository/branches'), { per_page: 100, page })),
    paginate((page) => call<T[]>(p.hostId, proj(p, '/repository/tags'), { per_page: 100, page, order_by: 'updated' }))
  ])
  return [
    ...branches.map((b): RefInfo => ({ name: b.name, sha: b.commit.id, type: 'branch', isDefault: b.default })),
    ...tags.map((t): RefInfo => ({ name: t.name, sha: t.commit.id, type: 'tag' }))
  ]
}

export const getCommit = (p: ProjectConfig, sha: string) =>
  call<Commit>(p.hostId, proj(p, `/repository/commits/${encodeURIComponent(sha)}`), { stats: true }).then((r) => r.data)

export const getCommitRefs = (p: ProjectConfig, sha: string) =>
  call<CommitRef[]>(p.hostId, proj(p, `/repository/commits/${sha}/refs`), { type: 'all', per_page: 100 }).then((r) => r.data)

export const getCommitMRs = (p: ProjectConfig, sha: string) =>
  call<MergeRequest[]>(p.hostId, proj(p, `/repository/commits/${sha}/merge_requests`)).then((r) => r.data)

export const getCommitDiff = (p: ProjectConfig, sha: string) =>
  call<FileDiff[]>(p.hostId, proj(p, `/repository/commits/${sha}/diff`), { per_page: 100 }).then((r) => r.data)

export const searchProjects = (hostId: string, search: string, membership: boolean) =>
  call<GitLabProject[]>(hostId, '/projects', {
    search: search.trim() || undefined,
    search_namespaces: true,
    membership,
    simple: true,
    order_by: 'last_activity_at',
    per_page: 50
  }).then((r) => r.data)

export const getProjectByPath = (hostId: string, path: string) =>
  call<GitLabProject>(hostId, `/projects/${encodeURIComponent(path.trim())}`).then((r) => r.data)

/** 서버 author 파라미터를 지원하지 않는 구버전 GitLab 대비, 클라이언트에서도 같은 조건을 적용 */
export function matchesAuthor(c: Commit, author: string): boolean {
  const a = author.trim().toLowerCase()
  return !a || `${c.author_name} <${c.author_email}>`.toLowerCase().includes(a)
}
