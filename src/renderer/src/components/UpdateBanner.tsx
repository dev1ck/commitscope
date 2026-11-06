import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'

/** 새 버전 알림. [지금 업데이트] 한 번으로 받아서 설치 후 재시작한다 */
export function UpdateBanner() {
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' })
  const [hidden, setHidden] = useState<string | null>(null)

  useEffect(() => {
    window.api.getUpdateStatus().then(setS)
    return window.api.onUpdateStatus(setS)
  }, [])

  if (s.state === 'idle' || hidden === s.version) return null

  return (
    <div className={'update-banner' + (s.state === 'error' ? ' failed' : '')}>
      {s.state === 'available' && (
        <>
          <span className="grow">
            새 버전이 나왔습니다: <b>v{s.version}</b>
          </span>
          <button className="primary" onClick={() => window.api.installUpdate()}>
            {s.manual ? '다운로드 페이지 열기' : '지금 업데이트'}
          </button>
          <button onClick={() => setHidden(s.version)}>나중에</button>
        </>
      )}
      {s.state === 'downloading' && (
        <>
          <span className="grow">v{s.version} 받는 중… {s.percent}%</span>
          <div className="update-progress">
            <div style={{ width: `${s.percent}%` }} />
          </div>
        </>
      )}
      {s.state === 'downloaded' && <span className="grow">설치 후 다시 시작합니다…</span>}
      {s.state === 'error' && (
        <>
          <span className="grow" title={s.message}>
            업데이트를 받지 못했습니다. 네트워크를 확인하고 다시 시도하세요.
          </span>
          <button className="primary" onClick={() => window.api.installUpdate()}>
            다시 시도
          </button>
          <button onClick={() => setHidden(s.version)}>닫기</button>
        </>
      )}
    </div>
  )
}
