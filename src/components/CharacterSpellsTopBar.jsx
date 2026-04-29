import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const LAYOUT_INNER = 'mx-auto w-[1180px] min-w-[1180px] shrink-0'

/**
 * 角色法术固定顶栏外壳：与 CharacterSheetTopBar 同款 fixed + portal、毛玻璃与底边；
 * 测量子内容高度并写入 --character-sheet-topbar-h。具体版心布局由子节点（CharacterSpells 内）提供。
 */
export default function CharacterSpellsTopBar({ children }) {
  /** 挂在 nav 上：高度含 safe-area-pt，与正文 padding-top 一致，避免被顶栏压住 */
  const navRef = useRef(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || typeof document === 'undefined') return undefined
    const apply = () => {
      const h = Math.ceil(nav.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--character-sheet-topbar-h', `${h}px`)
    }
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    ro?.observe(nav)
    window.addEventListener('resize', apply)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', apply)
      document.documentElement.style.removeProperty('--character-sheet-topbar-h')
    }
  }, [])

  const navEl = (
    <nav ref={navRef} className="fixed inset-x-0 top-0 z-40 w-full safe-area-pt" aria-label="角色法术顶栏">
      <div className="relative">
        <div
          className="relative z-10 border-b border-white/10 bg-[#2D3748]/78 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          <div className={`${LAYOUT_INNER} flex min-w-0 flex-col px-4 pb-1`}>{children}</div>
        </div>
      </div>
    </nav>
  )

  if (typeof document === 'undefined' || !document.body) return null
  return createPortal(navEl, document.body)
}
