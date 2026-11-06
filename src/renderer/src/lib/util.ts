import type { Commit } from './gitlab'

const pad = (n: number): string => String(n).padStart(2, '0')

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 오늘로부터 days일 전 날짜(YYYY-MM-DD) */
export function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function appendUnique(prev: Commit[], add: Commit[]): Commit[] {
  const have = new Set(prev.map((c) => c.id))
  return [...prev, ...add.filter((c) => !have.has(c.id))]
}

const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function commitsToCsv(commits: Commit[]): string {
  const head = ['sha', 'short_sha', 'title', 'author_name', 'author_email', 'authored_date', 'committer_name', 'committed_date', 'parents']
  const rows = commits.map((c) => [
    c.id,
    c.short_id,
    c.title,
    c.author_name,
    c.author_email,
    fmtDate(c.authored_date),
    c.committer_name,
    fmtDate(c.committed_date),
    c.parent_ids.join(' ')
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
