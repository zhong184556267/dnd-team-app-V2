import { CURRENCY_CONFIG } from '../data/currencyConfig'

/** 生成物品栏展示的「货币行」（余额>0） */
export function buildCurrencyRowsForInventory(wallet) {
  if (!wallet || typeof wallet !== 'object') return []
  const out = []
  for (const cfg of CURRENCY_CONFIG) {
    const raw = wallet[cfg.id]
    const amt = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
    if (amt <= 0) continue
    out.push({
      currencyId: cfg.id,
      label: cfg.unit ? `${cfg.name}（${cfg.unit}）` : cfg.name,
      qty: amt,
      order: cfg.order ?? 0,
    })
  }
  return out.sort((a, b) => a.order - b.order)
}
