import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectConfig, Settings } from '../../../shared/types'
import { ApiError, getCommit, listCommits, listRefs, matchesAuthor, type Commit, type CommitQuery, type QueryMode, type RefInfo } from '../lib/gitlab'
import { computeGraph } from '../lib/graph'
import { appendUnique, commitsToCsv, dayOffset } from '../lib/util'
import { CommitList } from './CommitList'
import { CommitDetail } from './CommitDetail'

export interface Jump {
  key: string
  sha: string
  n: number
}

interface Props {
  project: ProjectConfig
  allProjects: ProjectConfig[]
  settings: Settings
  onSettings: (s: Settings) => void
  jump: Jump | null
  onJump: (projectKey: string, sha: string) => void
}

const LOAD_ALL_LIMIT = 5000

export function ProjectView({ project, allProjects, settings, onSettings, jump, onJump }: Props) {
  const initial: CommitQuery = { mode: 'ref', ref: project.defaultBranch, from: '', to: '', since: '', until: '', author: '', path: '' }
  const [draft, setDraft] = useState<CommitQuery>(initial)
  const [query, setQuery] = useState<CommitQuery>(initial)
  const [refs, setRefs] = useState<RefInfo[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [nextPage, setNextPage] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [authors, setAuthors] = useState<string[]>([])
  const [hide, setHide] = useState(false)
  const [newShas, setNewShas] = useState<Set<string>>(new Set())
  const [shaInput, setShaInput] = useState('')

  const gen = useRef(0)
  const busy = useRef(false)
  const state = useRef({ commits, query, nextPage })
  state.current = { commits, query, nextPage }

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice((m) => (m === msg ? '' : m)), 4000)
  }

  const reloadRefs = useCallback(() => {
    listRefs(project)
      .then(setRefs)
      .catch((e) => setError(`브랜치/태그 조회 실패: ${(e as Error).message}`))
  }, [project])

  /** 조건을 바꿔 첫 페이지부터 다시 조회 */
  const runQuery = useCallback(
    async (q: CommitQuery) => {
      const g = ++gen.current
      busy.current = true
      setQuery(q)
      setLoading(true)
      setError('')
      setNewShas(new Set())
      try {
        const r = await listCommits(project, q, 1)
        if (g !== gen.current) return
        setCommits(r.data)
        setNextPage(r.nextPage)
      } catch (e) {
        if (g !== gen.current) return
        setCommits([])
        setNextPage(undefined)
        setError((e as Error).message)
      } finally {
        if (g === gen.current) {
          busy.current = false
          setLoading(false)
        }
      }
    },
    [project]
  )

  /** 다음 페이지들을 이어서 불러온다. all=true면 끝까지(최대 LOAD_ALL_LIMIT) */
  const loadMore = useCallback(
    async (all = false) => {
      if (busy.current || !state.current.nextPage) return
      const g = gen.current
      busy.current = true
      setLoading(true)
      let acc = state.current.commits
      let page: number | undefined = state.current.nextPage
      try {
        do {
          const r = await listCommits(project, state.current.query, page!)
          if (g !== gen.current) return
          acc = appendUnique(acc, r.data)
          page = r.nextPage
          setCommits(acc)
          setNextPage(page)
        } while (all && page && acc.length < LOAD_ALL_LIMIT)
      } catch (e) {
        if (g === gen.current) setError((e as Error).message)
      } finally {
        if (g === gen.current) {
          busy.current = false
          setLoading(false)
        }
      }
    },
    [project]
  )

  useEffect(() => {
    reloadRefs()
    runQuery(initial)
  }, [])

  useEffect(() => {
    if (jump) setSelected(jump.sha)
  }, [jump])

  // 자동 새로고침: 첫 페이지를 다시 받아 새 커밋만 위에 추가
  useEffect(() => {
    if (!settings.autoRefreshSec) return
    const timer = setInterval(async () => {
      if (busy.current) return
      const g = gen.current
      try {
        const r = await listCommits(project, state.current.query, 1)
        if (g !== gen.current) return
        const have = new Set(state.current.commits.map((c) => c.id))
        const fresh = r.data.filter((c) => !have.has(c.id))
        if (!fresh.length) return
        setCommits((prev) => [...fresh.filter((c) => !prev.some((p) => p.id === c.id)), ...prev])
        setNewShas((s) => new Set([...s, ...fresh.map((c) => c.id)]))
        reloadRefs()
        if (!document.hasFocus()) {
          window.api.notify(`${project.name}: 새 커밋 ${fresh.length}개`, fresh.slice(0, 3).map((c) => `${c.author_name}: ${c.title}`).join('\n'))
        }
      } catch {
        /* 다음 주기에 재시도 */
      }
    }, settings.autoRefreshSec * 1000)
    return () => clearInterval(timer)
  }, [settings.autoRefreshSec, project, reloadRefs])

  const lookupSha = async () => {
    const sha = shaInput.trim()
    if (!sha) return
    setError('')
    try {
      const c = await getCommit(project, sha)
      setSelected(c.id)
      if (!commits.some((x) => x.id === c.id)) flash('현재 목록 범위 밖의 커밋입니다. 상세 정보만 표시합니다.')
      return
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        setError((e as Error).message)
        return
      }
    }
    // 현재 프로젝트에 없으면 등록된 다른 프로젝트에서 찾는다
    for (const p of allProjects) {
      if (p.key === project.key) continue
      const c = await getCommit(p, sha).catch(() => null)
      if (c) {
        onJump(p.key, c.id)
        return
      }
    }
    setError(`커밋 '${sha}'을(를) 등록된 어떤 프로젝트에서도 찾을 수 없습니다.`)
  }

  // 표시 목록 계산
  const base = useMemo(() => (query.author ? commits.filter((c) => matchesAuthor(c, query.author)) : commits), [commits, query.author])

  const authorStats = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of base) m.set(c.author_name, (m.get(c.author_name) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [base])

  const filterActive = !!text.trim() || authors.length > 0
  const matches = useCallback(
    (c: Commit) => {
      if (authors.length && !authors.includes(c.author_name)) return false
      const t = text.trim().toLowerCase()
      if (!t) return true
      return (
        c.title.toLowerCase().includes(t) ||
        c.message.toLowerCase().includes(t) ||
        c.id.startsWith(t) ||
        c.author_name.toLowerCase().includes(t) ||
        c.author_email.toLowerCase().includes(t)
      )
    },
    [authors, text]
  )

  const hideMode = hide && filterActive
  const rows = useMemo(() => (hideMode ? base.filter(matches) : base), [hideMode, base, matches])
  // 작성자/경로로 걸러진 결과는 부모 커밋이 빠져 있어 그래프가 의미 없으므로 그리지 않는다
  const graphable = !hideMode && !query.author.trim() && !query.path.trim()
  const graph = useMemo(() => (graphable ? computeGraph(base) : null), [graphable, base])
  const matchCount = useMemo(() => (filterActive ? base.filter(matches).length : base.length), [filterActive, base, matches])

  const refsBySha = useMemo(() => {
    const m = new Map<string, RefInfo[]>()
    for (const r of refs) m.set(r.sha, [...(m.get(r.sha) ?? []), r])
    return m
  }, [refs])

  const setD = (patch: Partial<CommitQuery>) => setDraft((d) => ({ ...d, ...patch }))
  const apply = () => {
    if (draft.mode === 'range' && (!draft.from.trim() || !draft.to.trim())) {
      setError('범위 비교는 기준(from)과 대상(to)을 모두 입력해야 합니다.')
      return
    }
    runQuery(draft)
  }
  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && apply()

  const exportCsv = async () => {
    const list = filterActive ? base.filter(matches) : base
    const name = `${project.name}_${new Date().toISOString().slice(0, 10)}.csv`
    if (await window.api.saveCsv(name, commitsToCsv(list))) flash(`${list.length}개 커밋을 CSV로 저장했습니다.`)
  }

  const branchNames = refs.filter((r) => r.type === 'branch')
  const tagNames = refs.filter((r) => r.type === 'tag')

  const modes: [QueryMode, string][] = [
    ['ref', '브랜치/태그'],
    ['range', '범위 비교'],
    ['all', '전체 브랜치']
  ]

  return (
    <div className="project-view">
      <div className="filters">
        <div className="toolbar-row">
          <div className="segmented">
            {modes.map(([m, label]) => (
              <button key={m} className={draft.mode === m ? 'on' : ''} onClick={() => setD({ mode: m })}>
                {label}
              </button>
            ))}
          </div>
          {draft.mode === 'ref' && (
            <input list="refs" className="ref-input" value={draft.ref} placeholder={project.defaultBranch} onChange={(e) => setD({ ref: e.target.value })} onKeyDown={onEnter} />
          )}
          {draft.mode === 'range' && (
            <>
              <input list="refs" className="ref-input" value={draft.from} placeholder="기준 (예: v1.2.0 태그)" onChange={(e) => setD({ from: e.target.value })} onKeyDown={onEnter} title="여기에 없는 커밋만 표시" />
              <button className="icon" title="기준/대상 바꾸기" onClick={() => setD({ from: draft.to, to: draft.from })}>
                ⇄
              </button>
              <input list="refs" className="ref-input" value={draft.to} placeholder="대상 (예: develop 브랜치)" onChange={(e) => setD({ to: e.target.value })} onKeyDown={onEnter} />
            </>
          )}
          {draft.mode === 'all' && <span className="muted small">모든 원격 브랜치의 커밋</span>}
          <datalist id="refs">
            {branchNames.map((r) => (
              <option key={'b' + r.name} value={r.name} label={r.isDefault ? '브랜치 (기본)' : '브랜치'} />
            ))}
            {tagNames.map((r) => (
              <option key={'t' + r.name} value={r.name} label="태그" />
            ))}
          </datalist>
          <input className="path-input" value={draft.path} placeholder="파일/디렉터리 경로" onChange={(e) => setD({ path: e.target.value })} onKeyDown={onEnter} />
          <button className="primary" onClick={apply}>
            조회
          </button>
          <button onClick={() => (reloadRefs(), runQuery(query))} title="현재 조건으로 다시 조회">
            ⟳
          </button>
          <span className="spacer" />
          <input
            className="sha-input"
            value={shaInput}
            placeholder="커밋 SHA로 찾기"
            onChange={(e) => setShaInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupSha()}
          />
        </div>

        <div className="toolbar-row">
          <span className="label">기간</span>
          <input type="date" value={draft.since} onChange={(e) => setD({ since: e.target.value })} onKeyDown={onEnter} />
          <span>~</span>
          <input type="date" value={draft.until} onChange={(e) => setD({ until: e.target.value })} onKeyDown={onEnter} />
          <button className="small-btn" onClick={() => setD({ since: dayOffset(0), until: '' })}>
            오늘
          </button>
          <button className="small-btn" onClick={() => setD({ since: dayOffset(7), until: '' })}>
            7일
          </button>
          <button className="small-btn" onClick={() => setD({ since: dayOffset(30), until: '' })}>
            30일
          </button>
          <button className="small-btn" onClick={() => setD({ since: '', until: '' })}>
            기간 해제
          </button>
          <span className="label">작성자</span>
          <input className="author-input" value={draft.author} placeholder="이름 또는 이메일" onChange={(e) => setD({ author: e.target.value })} onKeyDown={onEnter} />
          <span className="spacer" />
          <span className="label">자동 새로고침</span>
          <select value={settings.autoRefreshSec} onChange={(e) => onSettings({ ...settings, autoRefreshSec: Number(e.target.value) })}>
            <option value={0}>끄기</option>
            <option value={30}>30초</option>
            <option value={60}>1분</option>
            <option value={300}>5분</option>
            <option value={900}>15분</option>
          </select>
        </div>

        <div className="toolbar-row sub">
          <span className="label">결과 내 필터</span>
          <input className="text-filter" value={text} placeholder="메시지 / SHA / 작성자 검색" onChange={(e) => setText(e.target.value)} />
          <details className="author-pick">
            <summary>작성자 {authors.length ? `(${authors.length})` : '전체'}</summary>
            <div className="author-menu">
              {authors.length > 0 && (
                <button className="small-btn" onClick={() => setAuthors([])}>
                  선택 해제
                </button>
              )}
              {authorStats.map(([name, n]) => (
                <label key={name} className="check">
                  <input
                    type="checkbox"
                    checked={authors.includes(name)}
                    onChange={(e) => setAuthors((a) => (e.target.checked ? [...a, name] : a.filter((x) => x !== name)))}
                  />
                  <span className="grow">{name}</span>
                  <span className="muted">{n}</span>
                </label>
              ))}
            </div>
          </details>
          <label className="check" title="끄면 일치하지 않는 커밋을 흐리게 표시하고 그래프를 유지합니다">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            일치하지 않는 커밋 숨기기
          </label>
          <span className="spacer" />
          <span className="muted small">
            {base.length.toLocaleString()}개 로드{filterActive && ` · ${matchCount.toLocaleString()}개 일치`}
            {nextPage ? ' · 더 있음' : ' · 끝'}
          </span>
          <button className="small-btn" disabled={!nextPage || loading} onClick={() => loadMore(true)} title={`최대 ${LOAD_ALL_LIMIT.toLocaleString()}개까지`}>
            모두 불러오기
          </button>
          <button className="small-btn" disabled={!base.length} onClick={exportCsv}>
            CSV 내보내기
          </button>
        </div>
      </div>

      {error && (
        <div className="error">
          {error}
          <button className="icon" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}

      <div className="content">
        <CommitList
          commits={rows}
          graph={graph}
          dim={filterActive && !hideMode ? (c) => !matches(c) : undefined}
          refsBySha={refsBySha}
          selected={selected}
          newShas={newShas}
          loading={loading}
          hasMore={!!nextPage}
          onSelect={setSelected}
          onLoadMore={() => loadMore()}
          onOpen={(c) => window.api.openExternal(c.web_url)}
        />
        {selected && <CommitDetail project={project} sha={selected} onSelect={setSelected} onClose={() => setSelected(null)} onFlash={flash} />}
      </div>
    </div>
  )
}
