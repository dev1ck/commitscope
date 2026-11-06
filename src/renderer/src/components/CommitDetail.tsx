import { useEffect, useState } from 'react'
import type { ProjectConfig } from '../../../shared/types'
import { getCommit, getCommitDiff, getCommitMRs, getCommitRefs, type Commit, type CommitRef, type FileDiff, type MergeRequest } from '../lib/gitlab'
import { cherryPickSources, copyText, fmtDate } from '../lib/util'

interface Props {
  project: ProjectConfig
  sha: string
  /** 이미 불러온 커밋 목록. 이 커밋을 체리픽해 간 커밋을 찾는 데 쓴다 */
  loaded: Commit[]
  onSelect: (sha: string) => void
  /** 다른 프로젝트까지 포함해 SHA로 커밋을 찾아 이동 */
  onLookup: (sha: string) => void
  onClose: () => void
  onFlash: (msg: string) => void
}

const REFS_PREVIEW = 12
const MR_STATE: Record<string, string> = { opened: '열림', merged: '머지됨', closed: '닫힘', locked: '잠김' }

function countLines(diff: string): [number, number] {
  let add = 0, del = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+')) add++
    else if (line.startsWith('-')) del++
  }
  return [add, del]
}

export function CommitDetail({ project, sha, loaded, onSelect, onLookup, onClose, onFlash }: Props) {
  const [commit, setCommit] = useState<Commit | null>(null)
  const [error, setError] = useState('')
  const [refs, setRefs] = useState<CommitRef[] | null>(null)
  const [mrs, setMrs] = useState<MergeRequest[] | null>(null)
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showAllRefs, setShowAllRefs] = useState(false)
  /** 원본 커밋 SHA → 커밋 (null이면 이 프로젝트에 없음) */
  const [origins, setOrigins] = useState<Record<string, Commit | null>>({})

  useEffect(() => {
    let alive = true
    setCommit(null), setError(''), setRefs(null), setMrs(null), setDiffs(null), setOpen(new Set()), setShowAllRefs(false)
    setOrigins({})
    getCommit(project, sha)
      .then((c) => {
        if (!alive) return
        setCommit(c)
        for (const o of cherryPickSources(c.message)) {
          getCommit(project, o)
            .then((oc) => alive && setOrigins((m) => ({ ...m, [o]: oc })))
            .catch(() => alive && setOrigins((m) => ({ ...m, [o]: null })))
        }
      })
      .catch((e) => alive && setError((e as Error).message))
    getCommitRefs(project, sha).then((r) => alive && setRefs(r)).catch(() => alive && setRefs([]))
    getCommitMRs(project, sha).then((r) => alive && setMrs(r)).catch(() => alive && setMrs([]))
    getCommitDiff(project, sha).then((r) => alive && setDiffs(r)).catch(() => alive && setDiffs([]))
    return () => {
      alive = false
    }
  }, [project, sha])

  const copy = async (text: string, label: string) => {
    await copyText(text)
    onFlash(`${label} 복사됨`)
  }

  const picks = commit ? cherryPickSources(commit.message) : []
  // 역방향: 불러온 커밋 중 메시지에 이 커밋을 원본으로 적어 둔 것
  const copies = commit ? loaded.filter((c) => cherryPickSources(c.message).some((o) => commit.id.startsWith(o))) : []

  const toggle = (path: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })

  return (
    <div className="detail">
      <div className="detail-head">
        <span className="mono">{sha.slice(0, 12)}</span>
        <span className="spacer" />
        <button className="small-btn" onClick={() => copy(sha, 'SHA')}>
          SHA 복사
        </button>
        {commit && (
          <button className="small-btn" onClick={() => window.api.openExternal(commit.web_url)}>
            GitLab에서 열기
          </button>
        )}
        <button className="icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="detail-body">
        {error && <div className="error">{error}</div>}
        {!commit && !error && <div className="muted">불러오는 중…</div>}
        {commit && (
          <>
            <h3 className="commit-title">{commit.title}</h3>
            {commit.message.trim() !== commit.title.trim() && <pre className="commit-msg">{commit.message.trim()}</pre>}

            <table className="meta">
              <tbody>
                <tr>
                  <th>작성자</th>
                  <td>
                    <b>{commit.author_name}</b>{' '}
                    <span className="link muted" onClick={() => copy(commit.author_email, '이메일')}>
                      &lt;{commit.author_email}&gt;
                    </span>
                    <div className="muted">{fmtDate(commit.authored_date)}</div>
                  </td>
                </tr>
                {(commit.committer_email !== commit.author_email || commit.committed_date !== commit.authored_date) && (
                  <tr>
                    <th>커미터</th>
                    <td>
                      {commit.committer_name} <span className="muted">&lt;{commit.committer_email}&gt;</span>
                      <div className="muted">{fmtDate(commit.committed_date)}</div>
                    </td>
                  </tr>
                )}
                <tr>
                  <th>SHA</th>
                  <td className="mono small">{commit.id}</td>
                </tr>
                <tr>
                  <th>부모</th>
                  <td>
                    {commit.parent_ids.length === 0 && <span className="muted">없음 (최초 커밋)</span>}
                    {commit.parent_ids.map((id) => (
                      <span key={id} className="link mono parent" onClick={() => onSelect(id)}>
                        {id.slice(0, 8)}
                      </span>
                    ))}
                    {commit.parent_ids.length > 1 && <span className="badge">merge</span>}
                  </td>
                </tr>
                {picks.length > 0 && (
                  <tr>
                    <th title="이 커밋을 체리픽해 온 원래 커밋 (git cherry-pick -x 가 메시지에 남긴 SHA)">원본 커밋</th>
                    <td>
                      {picks.map((o) => (
                        <div key={o} className="link" onClick={() => onLookup(o)} title="클릭하면 원본 커밋으로 이동 (다른 프로젝트도 찾음)">
                          <span className="mono">{o.slice(0, 8)}</span>{' '}
                          {origins[o] === undefined ? (
                            <span className="muted">…</span>
                          ) : origins[o] ? (
                            origins[o]!.title
                          ) : (
                            <span className="muted small">이 프로젝트에 없음 · 클릭해서 다른 프로젝트에서 찾기</span>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                {copies.length > 0 && (
                  <tr>
                    <th title="이 커밋을 체리픽해서 만든 복사본 (git cherry-pick -x 메시지 기준, 불러온 목록 안에서만 찾음)">복사된 커밋</th>
                    <td>
                      {copies.map((c) => (
                        <div key={c.id} className="link" onClick={() => onSelect(c.id)}>
                          <span className="mono">{c.short_id}</span> {c.title}
                        </div>
                      ))}
                      <div className="muted small">불러온 커밋 안에서만 찾습니다</div>
                    </td>
                  </tr>
                )}
                {commit.stats && (
                  <tr>
                    <th>변경</th>
                    <td>
                      <span className="add">+{commit.stats.additions}</span> <span className="del">−{commit.stats.deletions}</span>
                    </td>
                  </tr>
                )}
                <tr>
                  <th title="이 커밋을 히스토리에 포함하고 있는 브랜치와 태그">포함된 브랜치/태그</th>
                  <td>
                    {refs === null && <span className="muted">…</span>}
                    {refs?.length === 0 && <span className="muted">없음</span>}
                    {refs?.slice(0, showAllRefs ? undefined : REFS_PREVIEW).map((r) => (
                      <span key={r.type + r.name} className={`badge ${r.type}`}>
                        {r.type === 'tag' ? '🏷 ' : ''}
                        {r.name}
                      </span>
                    ))}
                    {refs && refs.length > REFS_PREVIEW && (
                      <span className="link muted small" onClick={() => setShowAllRefs((v) => !v)}>
                        {showAllRefs ? '접기' : `+${refs.length - REFS_PREVIEW}개 더 보기`}
                      </span>
                    )}
                    {showAllRefs && refs?.length === 100 && <span className="muted small"> (최대 100개까지 표시)</span>}
                  </td>
                </tr>
                <tr>
                  <th>MR</th>
                  <td>
                    {mrs === null && <span className="muted">…</span>}
                    {mrs?.length === 0 && <span className="muted">없음</span>}
                    {mrs?.map((m) => (
                      <div key={m.iid} className="link" onClick={() => window.api.openExternal(m.web_url)}>
                        !{m.iid} {m.title} <span className="muted small">({MR_STATE[m.state] ?? m.state}, {m.source_branch} → {m.target_branch})</span>
                      </div>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <div className="files-head">
          변경된 파일 {diffs ? `${diffs.length}${diffs.length === 100 ? '+' : ''}개` : '…'}
          {commit && commit.parent_ids.length > 1 && <span className="muted small"> (첫 번째 부모 기준)</span>}
        </div>
        {diffs?.map((d) => {
          const path = d.new_path
          const [a, r] = countLines(d.diff)
          const kind = d.new_file ? 'A' : d.deleted_file ? 'D' : d.renamed_file ? 'R' : 'M'
          return (
            <div key={d.old_path + path} className="file">
              <div className="file-row" onClick={() => toggle(path)}>
                <span className={`kind k-${kind}`}>{kind}</span>
                <span className="grow ellipsis" title={d.renamed_file ? `${d.old_path} → ${path}` : path}>
                  {d.renamed_file ? `${d.old_path} → ${path}` : path}
                </span>
                <span className="add">+{a}</span>
                <span className="del">−{r}</span>
              </div>
              {open.has(path) &&
                (d.too_large || d.collapsed || !d.diff ? (
                  <div className="muted small pad">diff가 너무 크거나 바이너리 파일입니다. GitLab에서 확인하세요.</div>
                ) : (
                  <pre className="diff">
                    {d.diff.split('\n').map((line, i) => (
                      <div key={i} className={line.startsWith('+') ? 'd-add' : line.startsWith('-') ? 'd-del' : line.startsWith('@@') ? 'd-hunk' : ''}>
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
