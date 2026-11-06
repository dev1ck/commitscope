import { useState } from 'react'
import type { AppConfig, HostInput } from '../../../shared/types'

interface Props {
  config: AppConfig
  onChange: (c: AppConfig) => void
  onClose: () => void
}

const blank = (): HostInput => ({ name: '', baseUrl: 'https://', token: '' })

export function HostsDialog({ config, onChange, onClose }: Props) {
  const [editing, setEditing] = useState<HostInput | null>(config.hosts.length ? null : blank())
  const [status, setStatus] = useState('')

  const test = async () => {
    if (!editing) return
    setStatus('연결 확인 중…')
    const r = await window.api.testHost(editing.baseUrl, editing.token ?? '', editing.id)
    setStatus(r.ok && r.data ? `✔ ${r.data.name} (@${r.data.username}) 계정으로 연결됨` : `✖ ${r.error}`)
  }

  const save = async () => {
    if (!editing || !editing.name.trim() || !/^https?:\/\/.+/.test(editing.baseUrl.trim())) {
      setStatus('이름과 http(s):// 로 시작하는 URL을 입력하세요.')
      return
    }
    onChange(await window.api.saveHost(editing))
    setEditing(null)
    setStatus('')
  }

  const remove = async (id: string, name: string) => {
    const n = config.projects.filter((p) => p.hostId === id).length
    if (!confirm(`'${name}' 서버와 여기에 등록된 프로젝트 ${n}개를 삭제할까요?`)) return
    onChange(await window.api.deleteHost(id))
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-head">
          <h2>GitLab 서버</h2>
          <button className="icon" onClick={onClose}>
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
              <button onClick={() => (setEditing({ id: h.id, name: h.name, baseUrl: h.baseUrl, token: '' }), setStatus(''))}>
                편집
              </button>
              <button onClick={() => remove(h.id, h.name)}>삭제</button>
            </div>
          </div>
        ))}

        {editing ? (
          <div className="form">
            <label>
              이름
              <input value={editing.name} placeholder="예: 사내 GitLab" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              서버 URL
              <input
                value={editing.baseUrl}
                placeholder="https://gitlab.example.com"
                onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
              />
            </label>
            <label>
              Personal Access Token <span className="muted">(read_api 권한이면 충분합니다)</span>
              <input
                type="password"
                value={editing.token}
                placeholder={editing.id ? '변경하지 않으려면 비워두세요' : 'glpat-...'}
                onChange={(e) => setEditing({ ...editing, token: e.target.value })}
              />
            </label>
            <div className="muted small">토큰은 Windows 사용자 계정 키(DPAPI)로 암호화되어 이 PC에만 저장됩니다.</div>
            {status && <div className="status-msg">{status}</div>}
            <div className="dialog-actions">
              <button onClick={test}>연결 테스트</button>
              <span className="spacer" />
              {config.hosts.length > 0 && <button onClick={() => (setEditing(null), setStatus(''))}>취소</button>}
              <button className="primary" onClick={save}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions">
            <button onClick={() => setEditing(blank())}>+ 서버 추가</button>
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
