import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefInfo } from '../lib/gitlab'

interface Props {
  refs: RefInfo[]
  /** 단일 모드에서는 [입력값] */
  values: string[]
  /** true면 여러 개를 칩으로 선택한다 */
  multiple?: boolean
  placeholder?: string
  title?: string
  onChange: (values: string[]) => void
  onEnter: () => void
}

// 브랜치/태그 입력 콤보박스.
// 네이티브 <datalist>는 현재 입력값으로 항상 필터링해서, 값이 채워진 상태로 열면 그 항목만 보인다.
// 여기서는 처음 열 때 전체 목록을 보여주고, 사용자가 타이핑을 시작한 뒤에만 필터링한다.
export function RefCombo({ refs, values, multiple, placeholder, title, onChange, onEnter }: Props) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const [multiText, setMultiText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const text = multiple ? multiText : (values[0] ?? '')
  const setText = (v: string) => (multiple ? setMultiText(v) : onChange([v]))

  // 기본 브랜치를 맨 위로
  const sorted = useMemo(() => [...refs].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault)), [refs])
  const q = text.trim().toLowerCase()
  const items = typed && q ? sorted.filter((r) => r.name.toLowerCase().includes(q)) : sorted

  const show = () => {
    if (open) return
    setOpen(true)
    setTyped(false)
    setActive(multiple ? -1 : sorted.findIndex((r) => r.name === text))
  }

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const toggle = (name: string) => onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name])

  const pick = (r: RefInfo) => {
    if (!multiple) {
      onChange([r.name])
      setOpen(false)
      return
    }
    // 여러 개를 연달아 고를 수 있도록 목록은 열어 둔다
    toggle(r.name)
    setMultiText('')
    setTyped(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(items.length - 1, Math.max(0, i + d)))
    } else if (e.key === 'Enter') {
      if (open && items[active]) pick(items[active])
      else if (multiple && q) {
        // 목록에 없는 ref(커밋 SHA 등)도 직접 입력해 추가할 수 있다
        if (!values.includes(text.trim())) onChange([...values, text.trim()])
        setMultiText('')
      } else {
        setOpen(false)
        onEnter()
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Backspace' && multiple && !multiText && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div
      className={'ref-combo' + (multiple ? ' multi' : ' ref-input')}
      onMouseDown={(e) => {
        // 입력칸 바깥(칩 사이 여백, ▾)을 누르면 목록을 열고 닫는다
        if (e.target === inputRef.current) return
        e.preventDefault()
        inputRef.current?.focus()
        if (open) setOpen(false)
        else show()
      }}
    >
      {multiple &&
        values.map((v) => (
          <span key={v} className="ref-chip">
            {v}
            <span className="ref-chip-x" title="선택 해제" onMouseDown={(e) => (e.preventDefault(), e.stopPropagation(), toggle(v))}>
              ×
            </span>
          </span>
        ))}
      <input
        ref={inputRef}
        value={text}
        placeholder={multiple && values.length ? '' : placeholder}
        title={title}
        onFocus={show}
        onMouseDown={show}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setTyped(true)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
      />
      <span className="ref-combo-caret">▾</span>
      {open && (
        <div className="ref-combo-list" ref={listRef}>
          {items.map((r, i) => {
            const on = values.includes(r.name)
            return (
              <div
                key={r.type + r.name}
                className={'ref-combo-item' + (i === active ? ' active' : '') + (on ? ' current' : '')}
                onMouseDown={(e) => (e.preventDefault(), e.stopPropagation(), pick(r))}
                onMouseEnter={() => setActive(i)}
              >
                {multiple && <span className="ref-check">{on ? '✓' : ''}</span>}
                <span className="grow ellipsis">{r.name}</span>
                <span className={'badge ' + r.type}>{r.type === 'branch' ? (r.isDefault ? '기본 브랜치' : '브랜치') : '태그'}</span>
              </div>
            )
          })}
          {!items.length && <div className="ref-combo-empty">일치하는 브랜치/태그가 없습니다{multiple ? ' · Enter로 직접 추가' : ''}</div>}
        </div>
      )}
    </div>
  )
}
