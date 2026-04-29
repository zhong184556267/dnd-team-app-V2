/**
 * 公家次元袋内的「钱币堆」(walletCurrencyId)、秘法箱（团队仓库）内钱币实物堆、与账面 team_vault 合并统计与扣款。
 */
import { getEmptyBalances, CURRENCY_IDS, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import {
  getTeamVault,
  setTeamVault,
  adjustVault,
  getCharacterWallet,
  convertCurrency,
  loadTeamVaultIntoCache,
  deductFromCharacterWalletAndBag,
} from './currencyStore'
import {
  getWarehouse,
  loadWarehouseIntoCache,
  addWarehouseCurrencyStack,
  tryConsumeWarehouseCurrencyStacks,
} from './warehouseStore'
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

/** 公家袋内「嵌套在次元袋 nested」中的钱币（子行常无 inBagOfHolding，按父袋归属计入） */
function addPublicBagNestedWalletBalances(out, nodes) {
  if (!Array.isArray(nodes)) return
  for (const e of nodes) {
    if (!e || typeof e !== 'object') continue
    if (e.walletCurrencyId) {
      const cid = e.walletCurrencyId
      if (!(cid in out)) continue
      const q = Number(e.qty) || 0
      out[cid] = (out[cid] ?? 0) + (cid === 'gem_lb' ? q : Math.floor(q))
    }
    if (e.itemId === 'bag_of_holding') addPublicBagNestedWalletBalances(out, e.nestedInventory)
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
        if (!entryBelongsToBagModule(e, mod, mods)) continue
        if (e.walletCurrencyId) {
          const cid = e.walletCurrencyId
          const q = Math.max(0, Number(e.qty) || 0)
          out[cid] = (out[cid] ?? 0) + (cid === 'gem_lb' ? q : Math.floor(q))
        }
        if (e.itemId === 'bag_of_holding' && Array.isArray(e.nestedInventory) && e.nestedInventory.length > 0) {
          addPublicBagNestedWalletBalances(out, e.nestedInventory)
        }
      }
    }
  }
  return out
}

/** 秘法箱次元袋 nested 内钱币（与顶层实物堆一并计入团队金库） */
function addWarehouseNestedWalletBalances(out, nodes) {
  if (!Array.isArray(nodes)) return
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue
    if (n.walletCurrencyId) {
      const cid = n.walletCurrencyId
      if (!(cid in out)) continue
      const q = Number(n.qty) || 0
      out[cid] = (out[cid] ?? 0) + (cid === 'gem_lb' ? q : Math.floor(q))
    }
    if (n.itemId === 'bag_of_holding') addWarehouseNestedWalletBalances(out, n.nestedInventory)
  }
}

/** 秘法箱（团队仓库）内 walletCurrencyId 行按币种汇总（含袋内 nested） */
export function sumWarehouseWalletBalances(moduleId) {
  const out = getEmptyBalances()
  const list = getWarehouse(moduleId)
  if (!Array.isArray(list)) return out
  for (const e of list) {
    if (e?.walletCurrencyId) {
      const cid = e.walletCurrencyId
      if (!(cid in out)) continue
      const q = Number(e.qty) || 0
      out[cid] = (out[cid] ?? 0) + (cid === 'gem_lb' ? q : Math.floor(q))
    }
    if (e?.itemId === 'bag_of_holding' && Array.isArray(e.nestedInventory) && e.nestedInventory.length > 0) {
      addWarehouseNestedWalletBalances(out, e.nestedInventory)
    }
  }
  return out
}

/** 团队金库合计 = 账面(team_vault) + 秘法箱钱币实物 + 各公家次元袋内钱币堆 */
export function getEffectiveTeamVaultBalances(moduleId) {
  const vault = getTeamVault(moduleId)
  const wh = sumWarehouseWalletBalances(moduleId)
  const bag = sumPublicBagWalletBalances(moduleId)
  const out = getEmptyBalances()
  CURRENCY_IDS.forEach((id) => {
    out[id] = (vault[id] ?? 0) + (wh[id] ?? 0) + (bag[id] ?? 0)
  })
  return out
}

/**
 * 将旧版「纯账面」team_vault 余额一次性迁入秘法箱实物堆并清空账面（仅在有账面余额时执行）。
 */
export async function migrateLegacyTeamVaultIntoArcaneChest(moduleId) {
  if (isSupabaseEnabled()) {
    await loadTeamVaultIntoCache(moduleId)
    await loadWarehouseIntoCache(moduleId)
  }
  const v = getTeamVault(moduleId)
  let any = false
  for (const id of CURRENCY_IDS) {
    const raw = v[id] ?? 0
    const n = id === 'gem_lb' ? Math.max(0, Math.round(Number(raw) * 10) / 10) : Math.max(0, Math.floor(Number(raw)))
    if (n > 0) {
      any = true
      break
    }
  }
  if (!any) return { migrated: false }
  for (const id of CURRENCY_IDS) {
    const raw = v[id] ?? 0
    const n = id === 'gem_lb' ? Math.max(0, Math.round(Number(raw) * 10) / 10) : Math.max(0, Math.floor(Number(raw)))
    if (n <= 0) continue
    const r = await addWarehouseCurrencyStack(moduleId, id, n)
    if (!r.success) return { migrated: false, error: r.error }
  }
  await Promise.resolve(setTeamVault(moduleId, getEmptyBalances()))
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  return { migrated: true }
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
 * 从团队资金中扣除：先扣秘法箱实物堆，再扣账面金库，再按顺序扣公家次元袋内钱币堆。
 * @param {string} moduleId
 * @param {string} currencyId
 * @param {number} amount 正数
 */
export async function deductTeamCurrency(moduleId, currencyId, amount) {
  const n = currencyId === 'gem_lb' ? Number(amount) : Math.floor(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return { success: true }

  if (isSupabaseEnabled()) {
    await loadWarehouseIntoCache(moduleId)
    await loadTeamVaultIntoCache(moduleId)
  }

  let remaining = n
  const { taken } = await tryConsumeWarehouseCurrencyStacks(moduleId, currencyId, remaining)
  remaining -= taken

  const vaultAmt = getTeamVault(moduleId)[currencyId] ?? 0
  const fromVault = Math.min(remaining, vaultAmt)
  if (fromVault > 0) {
    const r = await adjustVault(moduleId, currencyId, -fromVault)
    if (!r.success) return r
    remaining -= fromVault
  }
  if (remaining <= (currencyId === 'gem_lb' ? 1e-9 : 0)) {
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

  if (remaining > (currencyId === 'gem_lb' ? 1e-9 : 0)) {
    return { success: false, error: '团队金库（含秘法箱、公家次元袋）该货币不足' }
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
  return { success: true }
}

/**
 * 仅从秘法箱 + 账面扣除（不碰公家袋内钱币）。用于「账面/秘法箱 → 公家袋」拖入。
 */
export async function deductTeamCurrencyWarehouseAndVaultOnly(moduleId, currencyId, amount) {
  const n = currencyId === 'gem_lb' ? Number(amount) : Math.floor(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return { success: true }
  if (isSupabaseEnabled()) {
    await loadWarehouseIntoCache(moduleId)
    await loadTeamVaultIntoCache(moduleId)
  }
  let remaining = n
  const { taken } = await tryConsumeWarehouseCurrencyStacks(moduleId, currencyId, remaining)
  remaining -= taken
  const vaultAmt = getTeamVault(moduleId)[currencyId] ?? 0
  const fromVault = Math.min(remaining, vaultAmt)
  if (fromVault > 0) {
    const r = await adjustVault(moduleId, currencyId, -fromVault)
    if (!r.success) return r
    remaining -= fromVault
  }
  if (remaining > (currencyId === 'gem_lb' ? 1e-9 : 0)) {
    return { success: false, error: '秘法箱与账面该货币不足' }
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
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

  if (isSupabaseEnabled()) {
    await loadTeamVaultIntoCache(moduleId)
    await loadWarehouseIntoCache(moduleId)
  }

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
  const d = await deductTeamCurrency(moduleId, fromId, amt)
  if (!d.success) return d

  const credit = await addWarehouseCurrencyStack(moduleId, toId, toAmount)
  if (!credit.success) {
    await addWarehouseCurrencyStack(moduleId, fromId, amt)
    return { success: false, error: credit.error || '兑入秘法箱失败' }
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

  const r = await deductTeamCurrencyWarehouseAndVaultOnly(moduleId, currencyId, q)
  if (!r.success) return r

  const ch = getCharacter(charId)
  const mods = getNormalizedBagModules(ch)
  const mod = mods.find((m) => m.id === bagModuleId)
  if (!mod || normalizeBagOfHoldingVisibility(mod.visibility) !== 'public' || (mod.bagCount || 0) <= 0) {
    await addWarehouseCurrencyStack(moduleId, currencyId, q)
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

/**
 * 角色个人（钱包+袋内钱币）转入团队：扣个人并加入秘法箱实物堆。
 */
export async function transferPersonalCurrencyToTeamWithRouting(moduleId, characterId, currencyId, amount) {
  let amt = amount
  if (amt === 'all' || amt === undefined) {
    const w = getCharacterWalletIncludingBagAmount(characterId, currencyId)
    amt = w
  } else {
    amt = currencyId === 'gem_lb' ? Number(amt) : Math.floor(Number(amt))
    if (!Number.isFinite(amt) || amt <= 0) {
      return { success: false, error: '请输入有效数量' }
    }
  }
  const maxW = getCharacterWalletIncludingBagAmount(characterId, currencyId)
  if (amt > maxW) return { success: false, error: '个人该货币不足' }

  const addFirst = await addWarehouseCurrencyStack(moduleId, currencyId, amt)
  if (!addFirst.success) return addFirst

  const d = await deductFromCharacterWalletAndBag(characterId, currencyId, amt)
  if (!d.success) {
    await tryConsumeWarehouseCurrencyStacks(moduleId, currencyId, amt)
    return d
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
  return { success: true }
}

function getCharacterWalletIncludingBagAmount(characterId, currencyId) {
  const ch = getCharacter(characterId)
  if (!ch) return 0
  const w = getCharacterWallet(characterId)[currencyId] ?? 0
  let bag = 0
  for (const e of ch.inventory || []) {
    if (!e?.inBagOfHolding || e.walletCurrencyId !== currencyId) continue
    bag += Number(e.qty) || 0
  }
  if (currencyId === 'gem_lb') return Math.max(0, w + bag)
  return Math.max(0, Math.floor(w) + Math.floor(bag))
}

/** 与数据库「次元袋」条目一致：单只袋内容量 */
const BAG_OF_HOLDING_CAPACITY_LB = 500
const BAG_OF_HOLDING_CAPACITY_CU_FT = 64

/**
 * 某角色某一「次元袋模块」的内容积上限（磅 / 立方尺 × 袋个数）。
 * 供背包锚点行、仓库页公家袋等展示「袋内 X / Y lb」；按模块 bagCount 累计。
 * @param {string} characterId
 * @param {string} bagModuleId
 * @returns {{ maxLb: number, maxCuFt: number, bagCount: number }}
 */
export function getPublicBagModuleCapacityLimits(characterId, bagModuleId) {
  if (!characterId || !bagModuleId) return { maxLb: 0, maxCuFt: 0, bagCount: 0 }
  const ch = getCharacter(characterId)
  if (!ch) return { maxLb: 0, maxCuFt: 0, bagCount: 0 }
  const mods = getNormalizedBagModules(ch)
  const mod = mods.find((m) => m.id === bagModuleId)
  if (!mod) return { maxLb: 0, maxCuFt: 0, bagCount: 0 }
  const bags = Math.max(0, Math.floor(Number(mod.bagCount) || 0))
  return {
    maxLb: bags * BAG_OF_HOLDING_CAPACITY_LB,
    maxCuFt: bags * BAG_OF_HOLDING_CAPACITY_CU_FT,
    bagCount: bags,
  }
}
