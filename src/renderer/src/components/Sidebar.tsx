import type { AppConfig } from '../../../shared/types'

interface Props {
  config: AppConfig
  activeKey: string | null
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  onAdd: () => void
  onHosts: () => void
}

export function Sidebar({ config, activeKey, onSelect, onRemove, onAdd, onHosts }: Props) {
  const multiHost = config.hosts.length > 1
  const hostName = (id: string) => config.hosts.find((h) => h.id === id)?.name ?? '?'

  return (
    <aside className="sidebar">
      <div className="sidebar-head">Commitscope</div>
      <div className="project-list">
        {config.projects.map((p) => (
          <div
            key={p.key}
            className={'project-item' + (p.key === activeKey ? ' active' : '')}
            onClick={() => onSelect(p.key)}
            title={p.pathWithNamespace}
          >
            <div className="project-name">{p.name}</div>
            <div className="project-path">
              {multiHost && <span className="host-tag">{hostName(p.hostId)}</span>}
              {p.pathWithNamespace}
            </div>
            <button
              className="icon remove"
              title="목록에서 제거"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(p.key)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {!config.projects.length && <div className="muted pad">등록된 프로젝트가 없습니다.</div>}
      </div>
      <div className="sidebar-foot">
        <button onClick={onAdd}>+ 프로젝트 추가</button>
        <button onClick={onHosts}>GitLab 서버 설정</button>
      </div>
    </aside>
  )
}
