import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cherryPickSources } from './util.ts'

test('cherry-pick -x 메시지에서 원본 SHA를 추출한다', () => {
  const msg = 'Fix login bug\n\n(cherry picked from commit 0123456789abcdef0123456789abcdef01234567)'
  assert.deepEqual(cherryPickSources(msg), ['0123456789abcdef0123456789abcdef01234567'])
  assert.deepEqual(cherryPickSources('a\n(cherry picked from commit abc1234)\n(cherry picked from commit def5678)'), ['abc1234', 'def5678'])
  assert.deepEqual(cherryPickSources('일반 커밋'), [])
})
