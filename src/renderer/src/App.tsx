import { useEffect, useState } from 'react'
import type { AppConfig } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { HostsDialog } from './components/HostsDialog'
import { AddProjectDialog } from './components/AddProjectDialog'
import { ProjectView, type Jump } from './components/ProjectView'

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'hosts' | 'addProject' | null>(null)
  const [jump, setJump] = useState<Jump | null>(null)

  useEffect(() => {
    window.api.getConfig().then((c) => {
      setConfig(c)
      setActiveKey(c.projects[0]?.key ?? null)
      if (!c.hosts.length) setDialog('hosts')
    })
  }, [])

  if (!config) return null
  const active = config.projects.find((p) => p.key === activeKey)

  const removeProject = async (key: string) => {
    const p = config.projects.find((x) => x.key === key)
    if (!p || !confirm(`'${p.pathWithNamespace}' 프로젝트를 목록에서 제거할까요?`)) return
    const c = await window.api.saveProjects(config.projects.filter((x) => x.key !== key))
    setConfig(c)
    if (activeKey === key) setActiveKey(c.projects[0]?.key ?? null)
  }

  return (
    <div className="app">
      <Sidebar
        config={config}
        activeKey={activeKey}
        onSelect={setActiveKey}
        onRemove={removeProject}
        onAdd={() => setDialog(config.hosts.length ? 'addProject' : 'hosts')}
        onHosts={() => setDialog('hosts')}
      />
      <main className="main">
        {active ? (
          <ProjectView
            key={active.key}
            project={active}
            allProjects={config.projects}
            settings={config.settings}
            onSettings={async (s) => setConfig(await window.api.saveSettings(s))}
            jump={jump?.key === active.key ? jump : null}
            onJump={(key, sha) => {
              setActiveKey(key)
              setJump({ key, sha, n: Date.now() })
            }}
          />
        ) : (
          <div className="empty">
            {config.hosts.length ? (
              <button className="primary" onClick={() => setDialog('addProject')}>
                + 조회할 프로젝트 추가
              </button>
            ) : (
              <button className="primary" onClick={() => setDialog('hosts')}>
                GitLab 서버 등록하기
              </button>
            )}
          </div>
        )}
      </main>
      {dialog === 'hosts' && <HostsDialog config={config} onChange={setConfig} onClose={() => setDialog(null)} />}
      {dialog === 'addProject' && (
        <AddProjectDialog
          config={config}
          onChange={(c, addedKey) => {
            setConfig(c)
            if (addedKey && !activeKey) setActiveKey(addedKey)
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
