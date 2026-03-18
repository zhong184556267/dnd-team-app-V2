/**
 * 团队金库：Supabase 存 team_vault；否则 localStorage
 */
import { CURRENCY_CONFIG, CURRENCY_IDS, getEmptyBalances, getCurrencyById } from '../data/currencyConfig'
import { getCharacter, updateCharacter } from './characterStore'
import { isSupabaseEnabled } from './supabase'
import * as td from './teamDataSupabase'

const VAULT_KEY_PREFIX = 'dnd_team_vault_'
const VAULT_KEY_LEGACY = 'dnd_team_vault'

const vaultCache = {}

function vaultKey(moduleId) {
  return VAULT_KEY_PREFIX + (moduleId || 'default')
}

export async function loadTeamVaultIntoCache(moduleId) {
  if (!isSupabaseEnabled()) return
  const mod = moduleId ?? 'default'
  try {
    vaultCache[mod] = await td.fetchTeamVaultRow(mod)
  } catch {
    vaultCache[mod] = {}
  }
}

function getVaultRawLocal(moduleId) {
  try {
    const raw = localStorage.getItem(vaultKey(moduleId))
    const data = raw ? JSON.parse(raw) : null
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function migrateVaultIfNeeded(moduleId) {
  if (moduleId !== 'default') return
  try {
    const legacy = localStorage.getItem(VAULT_KEY_LEGACY)
    if (!legacy) return
    const data = JSON.parse(legacy)
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      localStorage.setItem(vaultKey('default'), JSON.stringify(data))
      localStorage.removeItem(VAULT_KEY_LEGACY)
    }
  } catch (_) {}
}

function saveVaultLocal(moduleId, data) {
  try {
    localStorage.setItem(vaultKey(moduleId), JSON.stringify(data))
  } catch (_) {}
}

function normalizeVault(raw) {
  const out = getEmptyBalances()
  CURRENCY_IDS.forEach((id) => {
    const v = raw[id]
    const n = typeof v === 'number' && !Number.isNaN(v) ? v : 0
    out[id] = n < 0 ? 0 : n
  })
  return out
}

export function getTeamVault(moduleId) {
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    const raw = vaultCache[mod] && typeof vaultCache[mod] === 'object' ? vaultCache[mod] : {}
    return normalizeVault(raw)
  }
  migrateVaultIfNeeded(moduleId)
  return normalizeVault(getVaultRawLocal(moduleId))
}

export function setTeamVault(moduleId, balances) {
  const out = normalizeVault(balances || {})
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    vaultCache[mod] = { ...out }
    return td.saveTeamVaultRow(mod, vaultCache[mod]).then(() => out)
  }
  saveVaultLocal(moduleId, out)
  return Promise.resolve(out)
}

export function adjustVault(moduleId, currencyId, delta) {
  const n = Number(delta)
  if (Number.isNaN(n) || n === 0) return Promise.resolve({ success: false, error: '请输入有效数量' })
  if (!CURRENCY_IDS.includes(currencyId)) return Promise.resolve({ success: false, error: '无效货币类型' })

  if (!isSupabaseEnabled()) {
    const vault = getTeamVault(moduleId)
    const current = vault[currencyId] ?? 0
    if (n < 0 && current + n < 0) return Promise.resolve({ success: false, error: '金库余额不足' })
    const next = { ...vault, [currencyId]: Math.max(0, current + n) }
    saveVaultLocal(moduleId, next)
    return Promise.resolve({ success: true })
  }

  return (async () => {
    await loadTeamVaultIntoCache(moduleId)
    const vault = getTeamVault(moduleId)
    const current = vault[currencyId] ?? 0
    if (n < 0 && current + n < 0) return { success: false, error: '金库余额不足' }
    const next = { ...vault, [currencyId]: Math.max(0, current + n) }
    vaultCache[moduleId ?? 'default'] = next
    await td.saveTeamVaultRow(moduleId, next)
    return { success: true }
  })()
}

export function convertVaultCurrency(moduleId, fromId, toId, amount) {
  if (!CURRENCY_IDS.includes(fromId) || !CURRENCY_IDS.includes(toId)) {
    return Promise.resolve({ success: false, error: '无效货币类型' })
  }
  if (fromId === toId) return Promise.resolve({ success: false, error: '请选择不同的货币' })

  const run = async () => {
    if (isSupabaseEnabled()) await loadTeamVaultIntoCache(moduleId)
    const vault = getTeamVault(moduleId)
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
    if (isSupabaseEnabled()) {
      vaultCache[moduleId ?? 'default'] = next
      await td.saveTeamVaultRow(moduleId, next)
    } else {
      saveVaultLocal(moduleId, next)
    }
    return { success: true }
  }
  return run()
}

function amountToGp(amount, currencyId) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg || cfg.baseRate <= 0) return 0
  return Number(amount) * cfg.baseRate
}

function gpToAmount(gpValue, currencyId) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg || cfg.baseRate <= 0) return 0
  const raw = gpValue / cfg.baseRate
  const isIntegerCurrency = currencyId === 'gem_lb'
  return isIntegerCurrency ? Math.round(raw) : Math.round(raw * 100) / 100
}

export function convertCurrency(amount, fromType, toType) {
  const num = Number(amount)
  if (Number.isNaN(num) || num <= 0) return 0
  if (fromType === toType) return num
  const gpValue = amountToGp(num, fromType)
  return gpToAmount(gpValue, toType)
}

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

export function transferCurrency(moduleId, direction, characterId, currencyId, amount) {
  return (async () => {
    if (isSupabaseEnabled()) await loadTeamVaultIntoCache(moduleId)
    const wallet = getCharacterWallet(characterId)
    const vault = getTeamVault(moduleId)

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
      if (amt > have) return { success: false, error: '个人余额不足' }
      const newWallet = { ...wallet, [currencyId]: have - amt }
      const newVault = { ...vault, [currencyId]: (vault[currencyId] ?? 0) + amt }
      await Promise.resolve(updateCharacter(characterId, { wallet: newWallet }))
      if (isSupabaseEnabled()) {
        vaultCache[moduleId ?? 'default'] = newVault
        await td.saveTeamVaultRow(moduleId, newVault)
      } else {
        saveVaultLocal(moduleId, newVault)
      }
      return { success: true }
    }

    if (direction === 'fromVault') {
      const inVault = vault[currencyId] ?? 0
      if (amt > inVault) return { success: false, error: '金库余额不足' }
      const newVault = { ...vault, [currencyId]: inVault - amt }
      const newWallet = { ...wallet, [currencyId]: (wallet[currencyId] ?? 0) + amt }
      if (isSupabaseEnabled()) {
        vaultCache[moduleId ?? 'default'] = newVault
        await td.saveTeamVaultRow(moduleId, newVault)
      } else {
        saveVaultLocal(moduleId, newVault)
      }
      await Promise.resolve(updateCharacter(characterId, { wallet: newWallet }))
      return { success: true }
    }

    return { success: false, error: '无效操作' }
  })()
}
