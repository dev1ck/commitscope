/**
 * 커밋 그래프 lane 배치.
 * 입력은 위에서 아래로(최신 → 과거, topo 순서) 정렬된 커밋 목록.
 * 각 행의 edges는 "이 행 → 다음 행" 구간의 선분이다.
 */
export interface GraphCommit {
  id: string
  parent_ids: string[]
}

export interface GraphEdge {
  /** 이 행에서의 lane */
  from: number
  /** 다음 행에서의 lane */
  to: number
  color: number
}

export interface GraphRow {
  col: number
  color: number
  isMerge: boolean
  edges: GraphEdge[]
}

export interface GraphLayout {
  rows: GraphRow[]
  width: number
}

export function computeGraph(commits: GraphCommit[]): GraphLayout {
  const lanes: (string | null)[] = []
  const colors: number[] = []
  let nextColor = 0
  let width = 0
  const rows: GraphRow[] = []

  const alloc = (sha: string): number => {
    let i = lanes.indexOf(null)
    if (i < 0) {
      i = lanes.length
      lanes.push(null)
    }
    lanes[i] = sha
    colors[i] = nextColor++
    return i
  }

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    let col = lanes.indexOf(c.id)
    if (col < 0) col = alloc(c.id)
    // 같은 커밋을 기다리던 다른 lane들은 여기서 합류하고 끝난다
    for (let k = 0; k < lanes.length; k++) if (k !== col && lanes[k] === c.id) lanes[k] = null

    const nodeColor = colors[col]
    const preExisting = new Set<number>()
    lanes.forEach((s, k) => {
      if (s !== null && k !== col) preExisting.add(k)
    })

    const fromNode = new Set<number>()
    if (c.parent_ids.length === 0) {
      lanes[col] = null
    } else {
      lanes[col] = c.parent_ids[0]
      fromNode.add(col)
      for (const p of c.parent_ids.slice(1)) {
        let k = lanes.indexOf(p)
        if (k < 0) k = alloc(p)
        fromNode.add(k)
      }
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    width = Math.max(width, lanes.length, col + 1)

    const next = commits[i + 1]
    let nextCol = -1
    if (next) nextCol = lanes.indexOf(next.id)

    const edges: GraphEdge[] = []
    lanes.forEach((s, k) => {
      if (s === null) return
      const to = nextCol >= 0 && s === next?.id ? nextCol : k
      if (fromNode.has(k)) edges.push({ from: col, to, color: colors[k] })
      if (!fromNode.has(k) || preExisting.has(k)) edges.push({ from: k, to, color: colors[k] })
    })

    rows.push({ col, color: nodeColor, isMerge: c.parent_ids.length > 1, edges })
  }

  return { rows, width }
}
