import { useEffect, useRef, useState } from 'react'
import type { AppConfig, ProjectConfig } from '../../../shared/types'
import { getProjectByPath, searchProjects, type GitLabProject } from '../lib/gitlab'

interface Props {
  config: AppConfig
  onChange: (c: AppConfig, addedKey?: string) => void
  onClose: () => void
}

export function AddProjectDialog({ config, onChange, onClose }: Props) {
  const [hostId, setHostId] = useState(config.hosts[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [membership, setMembership] = useState(true)
  const [results, setResults] = useState<GitLabProject[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const seq = useRef(0)

  const run = async () => {
    const n = ++seq.current // 늦게 도착한 이전 검색 결과가 덮어쓰지 않도록
    setBusy(true)
    setError('')
    setResults([])
    const q = search.trim()
    // "group/project" 형태로 입력했다면 정확한 경로를 먼저 조회해 바로 보여준다
    const exact = q.includes('/') ? await getProjectByPath(hostId, q).catch(() => null) : null
    if (n !== seq.current) return
    if (exact) setResults([exact])
    try {
      const list = await searchProjects(hostId, q, membership)
      if (n !== seq.current) return
      setResults(exact ? [exact, ...list.filter((p) => p.id !== exact.id)] : list)
    } catch (e) {
      if (n === seq.current && !exact) setError((e as Error).message)
    } finally {
      if (n === seq.current) setBusy(false)
    }
  }

  useEffect(() => {
    run()
  }, [hostId, membership])

  const isAdded = (p: GitLabProject) => config.projects.some((x) => x.key === `${hostId}:${p.id}`)

  const add = async (p: GitLabProject) => {
    if (isAdded(p)) return
    const project: ProjectConfig = {
      key: `${hostId}:${p.id}`,
      hostId,
      id: p.id,
      name: p.name,
      pathWithNamespace: p.path_with_namespace,
      webUrl: p.web_url,
      defaultBranch: p.default_branch ?? 'main'
    }
    onChange(await window.api.saveProjects([...config.projects, project]), project.key)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide">
        <div className="dialog-head">
          <h2>프로젝트 추가</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="toolbar-row">
          {config.hosts.length > 1 && (
            <select value={hostId} onChange={(e) => setHostId(e.target.value)}>
              {config.hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          <input
            className="grow"
            autoFocus
            value={search}
            placeholder="프로젝트 이름 또는 group/project 경로"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <button className="primary" onClick={run}>
            검색
          </button>
          <label className="check">
            <input type="checkbox" checked={membership} onChange={(e) => setMembership(e.target.checked)} />
            내가 멤버인 프로젝트만
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="result-list">
          {busy && <div className="muted pad">검색 중…</div>}
          {!busy && !results.length && !error && <div className="muted pad">결과가 없습니다.</div>}
          {results.map((p) => (
            <div key={p.id} className="result-item">
              <div className="grow">
                <div>
                  <b>{p.path_with_namespace}</b>
                </div>
                {p.description && <div className="muted small ellipsis">{p.description}</div>}
              </div>
              <button disabled={isAdded(p)} onClick={() => add(p)}>
                {isAdded(p) ? '추가됨' : '추가'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
