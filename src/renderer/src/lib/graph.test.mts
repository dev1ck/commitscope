import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeGraph } from './graph.ts'

const c = (id: string, ...parent_ids: string[]) => ({ id, parent_ids })
const edges = (g: ReturnType<typeof computeGraph>, i: number) =>
  g.rows[i].edges.map((e) => `${e.from}>${e.to}`).sort()

test('일자 히스토리는 lane 0 하나만 쓴다', () => {
  const g = computeGraph([c('C', 'B'), c('B', 'A'), c('A')])
  assert.deepEqual(g.rows.map((r) => r.col), [0, 0, 0])
  assert.equal(g.width, 1)
  assert.deepEqual(edges(g, 0), ['0>0'])
  assert.deepEqual(edges(g, 2), [])
})

test('merge 커밋은 두 번째 부모를 새 lane으로 분기하고 다시 합류한다', () => {
  // M = merge(B, F), F -> A, B -> A
  const g = computeGraph([c('M', 'B', 'F'), c('F', 'A'), c('B', 'A'), c('A')])
  assert.equal(g.rows[0].isMerge, true)
  assert.deepEqual(edges(g, 0), ['0>0', '0>1']) // M → B(lane0), M → F(lane1)
  assert.equal(g.rows[1].col, 1) // F
  assert.deepEqual(edges(g, 1), ['0>0', '1>1']) // B 대기 lane0 통과, F → A(lane1)
  assert.equal(g.rows[2].col, 0) // B
  assert.deepEqual(edges(g, 2), ['0>0', '1>0']) // 두 lane 모두 A로 합류
  assert.equal(g.rows[3].col, 0)
  assert.equal(g.width, 2)
})

test('서로 다른 브랜치 head는 별도 lane에서 시작한다', () => {
  const g = computeGraph([c('X', 'A'), c('Y', 'A'), c('A')])
  assert.deepEqual(g.rows.map((r) => r.col), [0, 1, 0])
  assert.deepEqual(edges(g, 0), ['0>0'])
  assert.deepEqual(edges(g, 1), ['0>0', '1>0'])
})

test('부모가 목록에 없으면(필터된 경우) lane이 남아도 오류 없이 처리된다', () => {
  const g = computeGraph([c('C', 'Z'), c('B', 'Y')])
  assert.deepEqual(g.rows.map((r) => r.col), [0, 1])
  assert.deepEqual(edges(g, 1), ['0>0', '1>1'])
})

test('이미 대기 중인 lane에 merge 부모가 있으면 노드에서 그 lane으로도 선을 긋는다', () => {
  // X(lane0) -> A, M(lane1) = merge(B, A): A는 이미 lane0에 있음
  const g = computeGraph([c('X', 'A'), c('M', 'B', 'A'), c('B', 'A'), c('A')])
  assert.equal(g.rows[1].col, 1)
  assert.deepEqual(edges(g, 1), ['0>0', '1>0', '1>1']) // lane0 통과 + M→lane0 + M→B
})
