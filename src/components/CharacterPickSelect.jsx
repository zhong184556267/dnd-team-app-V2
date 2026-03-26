import { useEffect, useRef, useState } from 'react'
import { ChevronDown, User } from 'lucide-react'

const THUMB_SM = 'h-5 w-5 min-h-5 min-w-5'
const THUMB_MD = 'h-6 w-6 min-h-6 min-w-6'

function CharacterThumb({ char, compact }) {
  const box = compact ? THUMB_SM : THUMB_MD
  const avatar = char?.avatar
  if (avatar && typeof avatar === 'string' && avatar.length > 0) {
    return (
      <img
        src={avatar}
        alt=""
        className={`${box} rounded object-cover shrink-0 border border-white/20 bg-gray-800`}
      />
    )
  }
  const initial = (char?.name || char?.codename || '?').trim().slice(0, 1) || '?'
  return (
    <div
      className={`${box} rounded shrink-0 border border-white/15 bg-gray-700/90 flex items-center justify-center text-[10px] font-semibold text-gray-200`}
      aria-hidden
    >
      {initial.toUpperCase()}
    </div>
  )
}

/**
 * 带头像的角色下拉（小图可辨认）；用于制作栏、存入角色等。
 */
export default function CharacterPickSelect({
  value,
  onChange,
  characters = [],
  allowEmpty = false,
  emptyLabel = '— 选择 —',
  placeholder = '— 选择 —',
  className = '',
  /** 触发器额外 class（建议含高度，如 h-8 / h-9） */
  triggerClassName = '',
  compact = true,
  disabled = false,
  /** 列表项右侧附加文案（如 GP） */
  optionExtra = null,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const list = Array.isArray(characters) ? characters : []
  const selected = value ? list.find((c) => c.id === value) : null
  const displayLabel =
    selected?.codename || selected?.name || (allowEmpty && !value ? emptyLabel : placeholder)

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded border border-gray-600 bg-gray-800/90 px-2 text-left text-sm text-white transition-colors hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName}`}
      >
        {selected ? (
          <CharacterThumb char={selected} compact={compact} />
        ) : (
          <span
            className={`flex shrink-0 items-center justify-center rounded border border-white/10 bg-gray-700/60 ${compact ? THUMB_SM : THUMB_MD} text-dnd-text-muted`}
          >
            <User className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-dnd-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <ul
          className="absolute left-0 right-0 z-[80] mt-1 max-h-56 overflow-auto rounded-lg border border-gray-600 bg-[#1e293b] py-1 shadow-xl"
          role="listbox"
        >
          {allowEmpty && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-gray-700/80 ${!value ? 'bg-gray-700/50' : ''}`}
              >
                <span className={`flex shrink-0 items-center justify-center rounded border border-white/10 bg-gray-700/60 ${compact ? THUMB_SM : THUMB_MD}`}>
                  <User className="h-3 w-3 text-dnd-text-muted" />
                </span>
                <span className="text-dnd-text-muted">{emptyLabel}</span>
              </button>
            </li>
          )}
          {list.map((c) => {
            const isSel = c.id === value
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-gray-700/80 ${isSel ? 'bg-emerald-900/35' : ''}`}
                >
                  <CharacterThumb char={c} compact={compact} />
                  <span className="min-w-0 flex-1 truncate">{c.codename || c.name || '未命名'}</span>
                  {typeof optionExtra === 'function' ? (
                    <span className="shrink-0 text-[11px] text-dnd-text-muted tabular-nums">{optionExtra(c)}</span>
                  ) : c.codename && c.name && c.codename !== c.name ? (
                    <span className="shrink-0 truncate text-[11px] text-dnd-text-muted">{c.name}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
