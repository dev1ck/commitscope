import { useState } from 'react'
import type { AppConfig, HostInput } from '../../../shared/types'

interface Props {
  config: AppConfig
  onChange: (c: AppConfig) => void
  onClose: () => void
}

const blank = (): HostInput => ({ name: '', baseUrl: '', token: '' })

export function HostsDialog({ config, onChange, onClose }: Props) {
  const [editing, setEditing] = useState<HostInput | null>(config.hosts.length ? null : blank())
  const [status, setStatus] = useState<{ text: string; failed?: boolean } | null>(null)
  const [pending, setPending] = useState(false)

  const edit = (host: HostInput | null) => {
    setEditing(host)
    setStatus(null)
  }

  const submit = async (action: 'test' | 'save') => {
    if (!editing || pending) return
    setPending(true)
    setStatus({ text: '연결 확인 중…' })
    const fallback = action === 'test' ? 'GitLab 연결을 확인하지 못했습니다.' : 'GitLab 서버 설정을 저장하지 못했습니다.'
    try {
      if (action === 'test') {
        const result = await window.api.testHost(editing.baseUrl, editing.token ?? '', editing.id)
        if (result.ok && result.data) setStatus({ text: `✔ ${result.data.name} (@${result.data.username}) 계정으로 연결됨` })
        else setStatus({ text: result.error ?? fallback, failed: true })
      } else {
        const result = await window.api.saveHost(editing)
        if (result.ok && result.data) {
          onChange(result.data)
          edit(null)
        } else {
          setStatus({ text: result.error ?? fallback, failed: true })
        }
      }
    } catch {
      setStatus({ text: fallback, failed: true })
    } finally {
      setPending(false)
    }
  }

  const remove = async (id: string, name: string) => {
    const n = config.projects.filter((p) => p.hostId === id).length
    if (!confirm(`'${name}' 서버와 여기에 등록된 프로젝트 ${n}개를 삭제할까요?`)) return
    onChange(await window.api.deleteHost(id))
  }

  return (
    <div className="overlay" onMouseDown={(e) => !pending && e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-head">
          <h2>GitLab 서버</h2>
          <button className="icon" disabled={pending} onClick={onClose}>
            ×
          </button>
        </div>

        {config.hosts.map((h) => (
          <div key={h.id} className="host-row">
            <div>
              <b>{h.name}</b> <span className="muted">{h.baseUrl}</span>
              {!h.hasToken && <span className="warn"> · 토큰 없음</span>}
            </div>
            <div className="row-actions">
              <button disabled={pending} onClick={() => edit({ id: h.id, name: h.name, baseUrl: h.baseUrl, token: '' })}>
                편집
              </button>
              <button disabled={pending} onClick={() => remove(h.id, h.name)}>삭제</button>
            </div>
          </div>
        ))}

        {editing ? (
          <div className="form">
            <label>
              이름
              <input disabled={pending} value={editing.name} placeholder="예: 사내 GitLab" onChange={(e) => edit({ ...editing, name: e.target.value })} />
            </label>
            <label>
              GitLab 기본 URL
              <input
                disabled={pending}
                value={editing.baseUrl}
                placeholder="https://gitlab.example.com"
                aria-describedby="gitlab-url-help"
                onChange={(e) => edit({ ...editing, baseUrl: e.target.value })}
              />
            </label>
            <div id="gitlab-url-help" className="muted small">프로젝트는 ‘프로젝트 추가’에서 등록하세요.</div>
            <label>
              Personal Access Token <span className="muted">(read_api 권한이면 충분합니다)</span>
              <input
                type="password"
                disabled={pending}
                value={editing.token}
                placeholder={editing.id ? '변경하지 않으려면 비워두세요' : 'glpat-...'}
                onChange={(e) => edit({ ...editing, token: e.target.value })}
              />
            </label>
            <div className="muted small">토큰은 Windows 사용자 계정 키(DPAPI)로 암호화되어 이 PC에만 저장됩니다.</div>
            {status && <div className={status.failed ? 'status-msg warn' : 'status-msg'} role={status.failed ? 'alert' : 'status'}>{status.text}</div>}
            <div className="dialog-actions">
              <button disabled={pending} onClick={() => submit('test')}>연결 테스트</button>
              <span className="spacer" />
              {config.hosts.length > 0 && <button disabled={pending} onClick={() => edit(null)}>취소</button>}
              <button className="primary" disabled={pending} onClick={() => submit('save')}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions">
            <button onClick={() => edit(blank())}>+ 서버 추가</button>
            <span className="spacer" />
            <button className="primary" onClick={onClose}>
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
