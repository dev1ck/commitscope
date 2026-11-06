import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feedHasMore, feedNext, newFeed, type FeedPage } from './feed.ts'

type C = { id: string; committed_date: string }
const at = (id: string, day: number): C => ({ id, committed_date: new Date(Date.UTC(2025, 0, day)).toISOString() })

/** 소스별 커밋 목록을 size개씩 잘라 주는 가짜 API */
const fake = (lists: C[][], size: number) => {
  const calls: string[] = []
  const fetch = async (s: number, page: number): Promise<FeedPage<C>> => {
    calls.push(`${s}:${page}`)
    const data = lists[s].slice((page - 1) * size, page * size)
    return { data, nextPage: page * size < lists[s].length ? page + 1 : undefined }
  }
  return { fetch, calls }
}

async function drain(lists: C[][], size: number) {
  const f = newFeed<C>(lists.length)
  const api = fake(lists, size)
  const out: string[] = []
  while (feedHasMore(f)) out.push(...(await feedNext(f, api.fetch)).map((c) => c.id))
  return { out, calls: api.calls }
}

test('소스가 하나면 서버 순서를 그대로 이어 붙인다', async () => {
  const { out } = await drain([[at('b', 5), at('a', 9), at('c', 1)]], 2)
  assert.deepEqual(out, ['b', 'a', 'c'])
})

test('여러 소스는 날짜순으로 병합하고 공통 커밋은 한 번만 낸다', async () => {
  const main = [at('m3', 9), at('m2', 6), at('base', 2), at('root', 1)]
  const dev = [at('d2', 8), at('d1', 4), at('base', 2), at('root', 1)]
  const { out } = await drain([main, dev], 2)
  assert.deepEqual(out, ['m3', 'd2', 'm2', 'd1', 'base', 'root'])
})

test('오래된 브랜치는 필요할 때까지 다음 페이지를 받지 않는다', async () => {
  const fresh = [at('f4', 20), at('f3', 19), at('f2', 18), at('f1', 17)]
  const old = [at('o2', 3), at('o1', 2)]
  const f = newFeed<C>(2)
  const api = fake([fresh, old], 2)
  const first = await feedNext(f, api.fetch)
  assert.deepEqual(first.map((c) => c.id), ['f4', 'f3'])
  await feedNext(f, api.fetch)
  assert.deepEqual(api.calls, ['0:1', '1:1', '0:2']) // old는 1페이지만
})
