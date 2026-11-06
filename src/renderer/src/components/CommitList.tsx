import { useEffect, useRef, useState } from 'react'
import type { Commit, RefInfo } from '../lib/gitlab'
import type { GraphLayout } from '../lib/graph'
import { fmtDate } from '../lib/util'

interface Props {
  commits: Commit[]
  /** null이면 그래프 열을 숨긴다 */
  graph: GraphLayout | null
  dim?: (c: Commit) => boolean
  refsBySha: Map<string, RefInfo[]>
  selected: string | null
  newShas: Set<string>
  loading: boolean
  hasMore: boolean
  onSelect: (sha: string) => void
  onLoadMore: () => void
  onOpen: (c: Commit) => void
}

const ROW = 26
const LANE = 14
const MAX_LANES = 24
const PALETTE = ['#4c8dff', '#e5534b', '#57ab5a', '#c69026', '#b083f0', '#39c5cf', '#e275ad', '#d4743a']
const laneX = (k: number) => LANE / 2 + 4 + k * LANE

export function CommitList(p: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const el = scroller.current!
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 선택된 커밋이 보이도록 스크롤
  useEffect(() => {
    const el = scroller.current
    const i = p.commits.findIndex((c) => c.id === p.selected)
    if (!el || i < 0) return
    const top = i * ROW
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight
  }, [p.selected, p.commits])

  // 바닥 근처까지 스크롤하면 다음 페이지
  useEffect(() => {
    if (p.hasMore && !p.loading && scrollTop + height > p.commits.length * ROW - ROW * 10) p.onLoadMore()
  }, [scrollTop, height, p.commits.length, p.hasMore, p.loading])

  const start = Math.max(0, Math.floor(scrollTop / ROW) - 5)
  const end = Math.min(p.commits.length, Math.ceil((scrollTop + height) / ROW) + 5)
  const lanes = p.graph ? Math.min(p.graph.width, MAX_LANES) : 0
  const graphW = p.graph ? Math.max(lanes * LANE + 8, 24) : 10

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = p.commits.findIndex((c) => c.id === p.selected)
    const j = e.key === 'ArrowDown' ? Math.min(p.commits.length - 1, i + 1) : Math.max(0, i - 1)
    if (p.commits[j]) p.onSelect(p.commits[j].id)
  }

  const renderGraph = () => {
    if (!p.graph) return null
    const g = p.graph
    const paths: React.ReactNode[] = []
    const nodes: React.ReactNode[] = []
    const y = (i: number) => (i - start) * ROW + ROW / 2
    for (let i = Math.max(0, start - 1); i < end; i++) {
      const r = g.rows[i]
      if (!r) continue
      r.edges.forEach((e, k) => {
        if (e.from >= MAX_LANES && e.to >= MAX_LANES) return
        const x1 = laneX(Math.min(e.from, MAX_LANES)), x2 = laneX(Math.min(e.to, MAX_LANES))
        const y1 = y(i), y2 = y(i + 1)
        const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${y1 + ROW * 0.6} ${x2} ${y2 - ROW * 0.6} ${x2} ${y2}`
        paths.push(<path key={`${i}-${k}`} d={d} stroke={PALETTE[e.color % PALETTE.length]} />)
      })
      if (i >= start && r.col < MAX_LANES) {
        const color = PALETTE[r.color % PALETTE.length]
        nodes.push(
          <circle
            key={'n' + i}
            cx={laneX(r.col)}
            cy={y(i)}
            r={r.isMerge ? 3 : 4.5}
            fill={r.isMerge ? 'var(--bg)' : color}
            stroke={color}
            strokeWidth={r.isMerge ? 2 : 1.5}
          />
        )
      }
    }
    return (
      <svg className="graph" width={graphW} height={(end - start) * ROW} style={{ top: start * ROW }}>
        <g fill="none" strokeWidth={2}>
          {paths}
        </g>
        {nodes}
      </svg>
    )
  }

  return (
    <div className="commit-list">
      <div className="list-head" style={{ paddingLeft: graphW }}>
        <span className="c-msg">메시지</span>
        <span className="c-author">작성자</span>
        <span className="c-date">작성일</span>
        <span className="c-sha">SHA</span>
      </div>
      <div className="list-body" ref={scroller} tabIndex={0} onKeyDown={onKeyDown} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: p.commits.length * ROW + (p.hasMore || p.loading ? ROW : 0), position: 'relative' }}>
          {renderGraph()}
          {p.commits.slice(start, end).map((c, k) => {
            const i = start + k
            const refs = p.refsBySha.get(c.id)
            const cls = ['row', c.id === p.selected && 'selected', p.dim?.(c) && 'dim', p.newShas.has(c.id) && 'new'].filter(Boolean).join(' ')
            return (
              <div
                key={c.id}
                className={cls}
                style={{ top: i * ROW, height: ROW, paddingLeft: graphW }}
                onClick={() => p.onSelect(c.id)}
                onDoubleClick={() => p.onOpen(c)}
                title={`${c.title}\n\n작성: ${c.author_name} <${c.author_email}> ${fmtDate(c.authored_date)}\n커밋: ${c.committer_name} ${fmtDate(c.committed_date)}`}
              >
                <span className="c-msg">
                  {p.newShas.has(c.id) && <span className="badge new-badge">NEW</span>}
                  {refs?.slice(0, 3).map((r) => (
                    <span key={r.type + r.name} className={`badge ${r.type}`}>
                      {r.type === 'tag' ? '🏷 ' : ''}
                      {r.name}
                    </span>
                  ))}
                  {refs && refs.length > 3 && (
                    <span className="badge" title={refs.slice(3).map((r) => r.name).join('\n')}>
                      +{refs.length - 3}
                    </span>
                  )}
                  {c.title}
                </span>
                <span className="c-author">{c.author_name}</span>
                <span className="c-date">{fmtDate(c.authored_date)}</span>
                <span className="c-sha mono">{c.short_id}</span>
              </div>
            )
          })}
          {(p.hasMore || p.loading) && (
            <div className="row loading-row" style={{ top: p.commits.length * ROW, height: ROW }}>
              {p.loading ? '불러오는 중…' : ''}
            </div>
          )}
        </div>
        {!p.loading && !p.commits.length && <div className="muted pad">조건에 맞는 커밋이 없습니다.</div>}
      </div>
    </div>
  )
}
