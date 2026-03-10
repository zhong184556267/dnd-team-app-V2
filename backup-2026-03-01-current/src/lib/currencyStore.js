/**
 * 团队金库 (team.vault) + 角色钱包 (character.wallet) 存储与转账
 * 使用高精度：换算时先转为 gp 再转为目标单位，避免浮点误差
 */

import { CURRENCY_CONFIG, CURRENCY_IDS, getEmptyBalances, getCurrencyById } from '../data/currencyConfig'
import { getCharacter, updateCharacter } from './characterStore'

const VAULT_KEY = 'dnd_team_vault'

function getVaultRaw() {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    const data = raw ? JSON.parse(raw) : null
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function saveVault(data) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data))
  } catch (_) {}
}

/** 团队金库余额（缺省为 0） */
export function getTeamVault() {
  const raw = getVaultRaw()
  const out = getEmptyBalances()
  CURRENCY_IDS.forEach((id) => {
    const v = raw[id]
    const n = typeof v === 'number' && !Number.isNaN(v) ? v : 0
    out[id] = n < 0 ? 0 : n
  })
  return out
}

/** 写入团队金库（全量替换，仅用于内部或管理员） */
export function setTeamVault(balances) {
  const out = getEmptyBalances()
  if (balances && typeof balances === 'object') {
    CURRENCY_IDS.forEach((id) => {
      const v = balances[id]
      const n = typeof v === 'number' && !Number.isNaN(v) ? v : 0
      out[id] = n < 0 ? 0 : n
    })
  }
  saveVault(out)
  return out
}

/**
 * 金库直接增减：+ 增加、- 减少（如经验值输入）
 * @param {string} currencyId 货币 id
 * @param {number} delta 正数增加、负数减少
 * @returns {{ success: boolean, error?: string }}
 */
export function adjustVault(currencyId, delta) {
  const n = Number(delta)
  if (Number.isNaN(n) || n === 0) return { success: false, error: '请输入有效数量' }
  if (!CURRENCY_IDS.includes(currencyId)) return { success: false, error: '无效货币类型' }
  const vault = getTeamVault()
  const current = vault[currencyId] ?? 0
  if (n < 0 && current + n < 0) return { success: false, error: '金库余额不足' }
  const next = { ...vault, [currencyId]: Math.max(0, current + n) }
  setTeamVault(next)
  return { success: true }
}

/**
 * 金库内货币兑换：从一种货币转为另一种（按汇率），直接更新金库
 * @param {string} fromId 源货币 id
 * @param {string} toId 目标货币 id
 * @param {number | 'all'} amount 兑换数量，'all' 表示全部
 * @returns {{ success: boolean, error?: string }}
 */
export function convertVaultCurrency(fromId, toId, amount) {
  if (!CURRENCY_IDS.includes(fromId) || !CURRENCY_IDS.includes(toId)) {
    return { success: false, error: '无效货币类型' }
  }
  if (fromId === toId) return { success: false, error: '请选择不同的货币' }
  const vault = getTeamVault()
  let amt = amount
  if (amt === 'all') {
    amt = vault[fromId] ?? 0
  } else {
    amt = Number(amt)
    if (Number.isNaN(amt) || amt <= 0) return { success: false, error: '请输入有效数量' }
  }
  const have = vault[fromId] ?? 0
  if (amt > have) return { success: false, error: '金库该货币余额不足' }
  const toAmount = convertCurrency(amt, fromId, toId)
  const next = { ...vault }
  next[fromId] = Math.max(0, have - amt)
  next[toId] = (next[toId] ?? 0) + toAmount
  setTeamVault(next)
  return { success: true }
}

/** 角色钱包：从角色数据读取，缺省为 0 */
export function getCharacterWallet(characterId) {
  const char = getCharacter(characterId)
  const raw = char?.wallet
  const out = getEmptyBalances()
  if (raw && typeof raw === 'object') {
    CURRENCY_IDS.forEach((id) => {
      const v = raw[id]
      const n = typeof v === 'number' && !Number.isNaN(v) ? v : 0
      out[id] = n < 0 ? 0 : n
    })
  }
  return out
}

/** 将金额转为 gp 基准（高精度：先乘后除，避免顺序误差） */
function amountToGp(amount, currencyId) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg || cfg.baseRate <= 0) return 0
  return Number(amount) * cfg.baseRate
}

/** 将 gp 数量转为目标货币数量（四舍五入到 2 位小数，晶石可为整数） */
function gpToAmount(gpValue, currencyId) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg || cfg.baseRate <= 0) return 0
  const raw = gpValue / cfg.baseRate
  const isIntegerCurrency = currencyId === 'gem_lb'
  return isIntegerCurrency ? Math.round(raw) : Math.round(raw * 100) / 100
}

/**
 * 汇率换算：源货币数量 → 目标货币数量
 * @param {number} amount 源数量
 * @param {string} fromType 源货币 id (cp/sp/gp/pp/au/gem_lb)
 * @param {string} toType 目标货币 id
 * @returns {number} 目标货币数量（四舍五入）
 */
export function convertCurrency(amount, fromType, toType) {
  const num = Number(amount)
  if (Number.isNaN(num) || num <= 0) return 0
  if (fromType === toType) return num
  const gpValue = amountToGp(num, fromType)
  return gpToAmount(gpValue, toType)
}

/**
 * 转账：角色 ↔ 团队金库
 * @param {'toVault' | 'fromVault'} direction 存入金库 / 从金库取出
 * @param {string} characterId 角色 id
 * @param {string} currencyId 货币类型
 * @param {number} amount 数量；若为 'all' 则全部
 * @returns {{ success: boolean, error?: string }}
 */
export function transferCurrency(direction, characterId, currencyId, amount) {
  const wallet = getCharacterWallet(characterId)
  const vault = getTeamVault()

  let amt = amount
  if (amt === 'all' || amt === undefined) {
    amt = direction === 'toVault' ? wallet[currencyId] ?? 0 : vault[currencyId] ?? 0
  } else {
    amt = Number(amt)
    if (Number.isNaN(amt) || amt <= 0) {
      return { success: false, error: '请输入有效数量' }
    }
  }

  if (direction === 'toVault') {
    const have = wallet[currencyId] ?? 0
    if (amt > have) {
      return { success: false, error: '个人余额不足' }
    }
    const newWallet = { ...wallet, [currencyId]: have - amt }
    const newVault = { ...vault, [currencyId]: (vault[currencyId] ?? 0) + amt }
    updateCharacter(characterId, { wallet: newWallet })
    setTeamVault(newVault)
    return { success: true }
  }

  if (direction === 'fromVault') {
    const inVault = vault[currencyId] ?? 0
    if (amt > inVault) {
      return { success: false, error: '金库余额不足' }
    }
    const newVault = { ...vault, [currencyId]: inVault - amt }
    const newWallet = { ...wallet, [currencyId]: (wallet[currencyId] ?? 0) + amt }
    setTeamVault(newVault)
    updateCharacter(characterId, { wallet: newWallet })
    return { success: true }
  }

  return { success: false, error: '无效操作' }
}
