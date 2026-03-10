import { convertCurrency } from '../lib/currencyStore'

/**
 * 自动计算：仓库内金币 → 可换算为晶石（磅）
 * vault 由父组件传入，金库变化时自动更新
 */
export default function CurrencyConverter({ vault = {} }) {
  const gp = typeof vault.gp === 'number' && !Number.isNaN(vault.gp) ? vault.gp : 0
  const gemLb = convertCurrency(gp, 'gp', 'gem_lb')

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 p-4 space-y-2">
      <h3 className="text-dnd-text-body text-sm font-semibold">汇率换算</h3>
      <p className="text-dnd-text-muted text-sm">
        仓库内金币 <span className="text-amber-200 font-semibold">{gp}</span>
        ，可换算为晶石 <span className="text-cyan-200 font-semibold">{gemLb}</span> 磅
      </p>
    </div>
  )
}
