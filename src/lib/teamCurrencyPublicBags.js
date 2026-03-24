/**
 * 公家次元袋内的「钱币堆」(walletCurrencyId) 与团队金库账面合并统计与扣款。
 */
import { getEmptyBalances, CURRENCY_IDS, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { getTeamVault, adjustVault, getCharacterWallet, convertCurrency, loadTeamVaultIntoCache } from './currencyStore'
import { isSupabaseEnabled } from './supabase'
import { getAllCharacters, getCharacter, updateCharacter } from './characterStore'
import { getNormalizedBagModules, entryBelongsToBagModule } from './bagOfHoldingModules'
import { normalizeBagOfHoldingVisibility } from './bagOfHoldingVisibility'

/** 拖拽：团队金库货币行 → 公家次元袋 */
export const DND_TEAM_VAULT_CURRENCY_MIME = 'text/dnd-team-vault-currency'

export function parseTeamVaultCurrencyDragPayload(raw) {
  if (raw == null || raw === '') return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o.moduleId !== 'string' || typeof o.currencyId !== 'string') return null
    const qty = Number(o.qty)
    if (!Number.isFinite(qty) || qty <= 0) return null
    return { moduleId: o.moduleId, currencyId: o.currencyId, qty: Math.floor(qty) }
  } catch {
    return null
  }
}

/** 所有「公家」次元袋模块内的钱币堆，按货币汇总 */
export function sumPublicBagWalletBalances(moduleId) {
  const out = getEmptyBalances()
  const chars = getAllCharacters(moduleId)
  for (const ch of chars) {
    const mods = getNormalizedBagModules(ch)
    const inv = ch.inventory || []
    for (const mod of mods) {
      if (normalizeBagOfHoldingVisibility(mod.visibility) !== 'public') continue
      if ((mod.bagCount || 0) <= 0) continue
      for (const e of inv) {
        if (!e?.walletCurrencyId) continue
        if (!entryBelongsToBagModule(e, mod, mods)) continue
        const cid = e.walletCurrencyId
        const q = Math.max(0, Number(e.qty) || 0)
        out[cid] = (out[cid] ?? 0) + q
      }
    }
  }
  return out
}

/** 团队金库合计 = 账面(team_vault) + 各公家次元袋内钱币堆 */
export function getEffectiveTeamVaultBalances(moduleId) {
  const vault = getTeamVault(moduleId)
  const bag = sumPublicBagWalletBalances(moduleId)
  const out = getEmptyBalances()
  CURRENCY_IDS.forEach((id) => {
    out[id] = (vault[id] ?? 0) + (bag[id] ?? 0)
  })
  return out
}

function findFirstPublicBagCurrencyStack(moduleId, currencyId) {
  const chars = getAllCharacters(moduleId)
  for (const ch of chars) {
    const mods = getNormalizedBagModules(ch)
    const inv = ch.inventory || []
    for (let invIdx = 0; invIdx < inv.length; invIdx++) {
      const e = inv[invIdx]
      if (!e?.walletCurrencyId || e.walletCurrencyId !== currencyId) continue
      if (!e.inBagOfHolding) continue
      for (const mod of mods) {
        if (normalizeBagOfHoldingVisibility(mod.visibility) !== 'public') continue
        if ((mod.bagCount || 0) <= 0) continue
        if (entryBelongsToBagModule(e, mod, mods)) {
          return { charId: ch.id, entryId: e.id, invIdx }
        }
      }
    }
  }
  return null
}

/**
 * 从团队资金中扣除：先扣账面金库，再按角色/背包顺序扣公家次元袋内钱币堆。
 * @param {string} moduleId
 * @param {string} currencyId
 * @param {number} amount 正数
 */
export async function deductTeamCurrency(moduleId, currencyId, amount) {
  const n = currencyId === 'gem_lb' ? Number(amount) : Math.floor(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return { success: true }

  let remaining = n
  const vaultAmt = getTeamVault(moduleId)[currencyId] ?? 0
  const fromVault = Math.min(remaining, vaultAmt)
  if (fromVault > 0) {
    const r = await adjustVault(moduleId, currencyId, -fromVault)
    if (!r.success) return r
    remaining -= fromVault
  }
  if (remaining <= 0) {
    window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
    window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
    return { success: true }
  }

  let guard = 0
  while (remaining > 0 && guard++ < 500) {
    const st = findFirstPublicBagCurrencyStack(moduleId, currencyId)
    if (!st) break
    const ch = getCharacter(st.charId)
    if (!ch?.inventory) break
    let invIdx = st.entryId ? ch.inventory.findIndex((it) => it?.id === st.entryId) : st.invIdx
    if (invIdx < 0) invIdx = st.invIdx
    if (invIdx < 0 || invIdx >= ch.inventory.length) continue
    const entry = ch.inventory[invIdx]
    if (!entry || entry.walletCurrencyId !== currencyId) continue
    const curQty = Math.max(0, Number(entry.qty) || 0)
    if (curQty <= 0) continue
    const take = currencyId === 'gem_lb' ? Math.min(remaining, curQty) : Math.min(remaining, Math.floor(curQty))
    if (take <= 0) break
    const nextQty = curQty - take
    const nextInv = ch.inventory
      .map((it, i) => {
        if (i !== invIdx) return it
        if (nextQty <= 0) return null
        return { ...it, qty: nextQty }
      })
      .filter(Boolean)
    await Promise.resolve(updateCharacter(st.charId, { inventory: nextInv }))
    remaining -= take
  }

  if (remaining > 0) {
    return { success: false, error: '团队金库（含公家次元袋）该货币不足' }
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
  return { success: true }
}

/**
 * 团队金库货币兑换：源币种从「账面 + 公家次元袋钱币堆」扣除（顺序与 deductTeamCurrency 一致），目标币种记入账面金库。
 */
export async function convertEffectiveTeamCurrency(moduleId, fromId, toId, amount) {
  if (!CURRENCY_IDS.includes(fromId) || !CURRENCY_IDS.includes(toId)) {
    return { success: false, error: '无效货币类型' }
  }
  if (fromId === toId) return { success: false, error: '请选择不同的货币' }

  if (isSupabaseEnabled()) await loadTeamVaultIntoCache(moduleId)

  const eff = getEffectiveTeamVaultBalances(moduleId)
  let amt
  if (amount === 'all') {
    amt = eff[fromId] ?? 0
    if (fromId !== 'gem_lb') amt = Math.floor(amt)
    if (!Number.isFinite(amt) || amt <= 0) {
      return { success: false, error: '该货币无可用余额' }
    }
  } else {
    amt = fromId === 'gem_lb' ? Number(amount) : Math.floor(Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) return { success: false, error: '请输入有效数量' }
  }

  const have = eff[fromId] ?? 0
  if (amt > have) return { success: false, error: '团队金库（含公家次元袋）该货币余额不足' }

  const toAmount = convertCurrency(amt, fromId, toId)
  const credit = await adjustVault(moduleId, toId, toAmount)
  if (!credit.success) return { success: false, error: credit.error || '兑入账面失败' }

  const d = await deductTeamCurrency(moduleId, fromId, amt)
  if (!d.success) {
    await adjustVault(moduleId, toId, -toAmount)
    return d
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  return { success: true }
}

/**
 * 从团队账面金库扣除并入指定公家次元袋（合并同币种钱币堆）
 */
export async function depositVaultCurrencyToPublicBag(moduleId, charId, bagModuleId, currencyId, qty) {
  const q = currencyId === 'gem_lb' ? Math.max(0, Number(qty)) : Math.floor(Number(qty))
  if (!Number.isFinite(q) || q <= 0) return { success: false, error: '数量无效' }

  const r = await adjustVault(moduleId, currencyId, -q)
  if (!r.success) return r

  const ch = getCharacter(charId)
  const mods = getNormalizedBagModules(ch)
  const mod = mods.find((m) => m.id === bagModuleId)
  if (!mod || normalizeBagOfHoldingVisibility(mod.visibility) !== 'public' || (mod.bagCount || 0) <= 0) {
    await adjustVault(moduleId, currencyId, q)
    return { success: false, error: '目标不是有效的公家次元袋' }
  }

  const inv = [...(ch.inventory || [])]
  const mergeIdx = inv.findIndex(
    (e) =>
      e?.walletCurrencyId === currencyId &&
      e.inBagOfHolding &&
      entryBelongsToBagModule(e, mod, mods),
  )
  const cfg = getCurrencyById(currencyId)
  const label = cfg ? getCurrencyDisplayName(cfg) : currencyId
  if (mergeIdx >= 0) {
    const e = inv[mergeIdx]
    inv[mergeIdx] = { ...e, qty: Math.max(0, Number(e.qty) || 0) + q }
  } else {
    inv.push({
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      walletCurrencyId: currencyId,
      name: label,
      qty: q,
      inBagOfHolding: true,
      bagModuleId: mod.id,
    })
  }
  await Promise.resolve(updateCharacter(charId, { inventory: inv }))
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
  return { success: true }
}

/**
 * 从团队资金（账面+公家袋）扣除并划入角色个人钱包（用于「从金库取出」）
 */
export async function transferFromTeamToWallet(moduleId, characterId, currencyId, amount) {
  let amt = amount
  if (amt === 'all' || amt === undefined) {
    amt = getEffectiveTeamVaultBalances(moduleId)[currencyId] ?? 0
  } else {
    amt = currencyId === 'gem_lb' ? Number(amt) : Math.floor(Number(amt))
    if (!Number.isFinite(amt) || amt <= 0) {
      return { success: false, error: '请输入有效数量' }
    }
  }
  const eff = getEffectiveTeamVaultBalances(moduleId)
  const have = eff[currencyId] ?? 0
  if (amt > have) return { success: false, error: '团队金库（含公家次元袋）余额不足' }

  const wallet = getCharacterWallet(characterId)
  const d = await deductTeamCurrency(moduleId, currencyId, amt)
  if (!d.success) return d
  await Promise.resolve(
    updateCharacter(characterId, {
      wallet: { ...wallet, [currencyId]: (wallet[currencyId] ?? 0) + amt },
    }),
  )
  return { success: true }
}
