import { getMartialStyleIntroduction } from '../data/martialTechniques'

/**
 * 展示某流派在《九剑之书》等中的介绍（房规武技库、战斗区选招弹窗等复用）
 */
export default function MartialStyleIntroBlock({ styleName, compact = false, className = '' }) {
  const intro = getMartialStyleIntroduction(styleName)
  if (!intro) return null
  const pClass = compact
    ? 'leading-snug text-dnd-text-muted text-[11px]'
    : 'leading-relaxed text-dnd-text-muted text-sm'
  const titleClass = compact ? 'text-dnd-gold-light font-bold text-xs mb-1' : 'text-dnd-gold-light font-bold text-sm mb-1.5'
  return (
    <div
      className={`rounded-lg border border-dnd-gold/20 bg-dnd-gold/[0.06] px-3 py-2 text-dnd-text-body space-y-1.5 ${className}`}
      role="region"
      aria-label={`${styleName}流派介绍`}
    >
      {intro.title ? <p className={titleClass}>{intro.title}</p> : null}
      {intro.paragraphs.map((p, i) => (
        <p key={i} className={pClass}>
          {p}
        </p>
      ))}
    </div>
  )
}
