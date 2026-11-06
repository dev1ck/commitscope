/**
 * 여러 조회 소스(브랜치별 커밋 목록)를 하나의 최신순 목록으로 이어 붙이는 페이지네이터.
 * GitLab API는 ref를 하나만 받으므로 여러 브랜치를 고르면 브랜치마다 따로 받아 날짜순으로 병합한다.
 * 소스가 하나면 서버가 준 순서(topo)를 그대로 유지한다.
 */
export interface FeedCommit {
  id: string
  committed_date: string
}

export interface FeedPage<T> {
  data: T[]
  nextPage?: number
}

interface Source {
  next?: number
  /** 지금까지 받은 커밋 중 가장 오래된 시각(ms). 아직 안 받았으면 Infinity */
  oldest: number
}

export interface Feed<T> {
  sources: Source[]
  /** 받았지만 아직 내보내지 않은 커밋 */
  pending: T[]
  seen: Set<string>
}

const time = (c: FeedCommit): number => Date.parse(c.committed_date)

export const newFeed = <T>(sourceCount: number): Feed<T> => ({
  sources: Array.from({ length: sourceCount }, () => ({ next: 1, oldest: Infinity })),
  pending: [],
  seen: new Set()
})

export const feedHasMore = (f: Feed<unknown>): boolean => f.pending.length > 0 || f.sources.some((s) => s.next)

/** 아직 더 받을 소스들이 멈춘 시각 중 가장 최근. 이보다 최신인 커밋은 앞으로 더 나오지 않으므로 확정할 수 있다 */
const watermark = (f: Feed<unknown>): number => Math.max(-Infinity, ...f.sources.filter((s) => s.next).map((s) => s.oldest))

/** 다음 묶음을 받아 확정된 커밋만 최신순으로 돌려준다 (f를 갱신한다) */
export async function feedNext<T extends FeedCommit>(f: Feed<T>, fetchPage: (source: number, page: number) => Promise<FeedPage<T>>): Promise<T[]> {
  const wm = watermark(f)
  // 확정을 막고 있는 소스(가장 최근에 멈춘 소스)만 더 받는다. 처음에는 전부
  const targets = f.sources.flatMap((s, i) => (s.next && s.oldest >= wm ? [i] : []))
  const pages = await Promise.all(targets.map((i) => fetchPage(i, f.sources[i].next!)))
  targets.forEach((i, k) => {
    const s = f.sources[i]
    s.next = pages[k].nextPage
    for (const c of pages[k].data) {
      s.oldest = Math.min(s.oldest, time(c))
      if (f.seen.has(c.id)) continue
      f.seen.add(c.id)
      f.pending.push(c)
    }
  })
  const w = watermark(f)
  const ready = f.pending.filter((c) => time(c) >= w)
  f.pending = f.pending.filter((c) => time(c) < w)
  if (f.sources.length > 1) ready.sort((a, b) => time(b) - time(a))
  return ready
}
