/**
 * 模组（小队/战役）：启用 Supabase 时存 campaign_modules + user_prefs；否则 localStorage
 * 若 Supabase SELECT 因 RLS 返回空数组但写入成功，用 localStorage 备份列表，避免界面永远只有「默认模组」
 */
import { isSupabaseEnabled } from './supabase'
import * as td from './teamDataSupabase'

const MODULES_KEY = 'dnd_modules'
const CURRENT_MODULE_KEY = 'dnd_current_module_id'
const DEFAULT_MODULE_ID = 'default'
/** 云端模组列表本地备份（与 clearLegacy 清除的旧键无关） */
const CLOUD_MODULES_LS = 'dnd_cloud_campaign_modules_v1'

let modulesCache = []
/** @type {Record<string, { current_module_id: string|null, default_chars: Record<string, string> }>} */
const prefsByOwner = {}

function readCloudModulesLS() {
  try {
    const raw = localStorage.getItem(CLOUD_MODULES_LS)
    const j = raw ? JSON.parse(raw) : []
    if (!Array.isArray(j)) return []
    return j
      .filter((m) => m && m.id && typeof m.name === 'string')
      .map((m) => ({ id: m.id, name: m.name }))
  } catch {
    return []
  }
}

function writeCloudModulesLS(list) {
  try {
    localStorage.setItem(
      CLOUD_MODULES_LS,
      JSON.stringify(list.map((m) => ({ id: m.id, name: m.name })))
    )
  } catch (_) {}
}

function applyServerRows(rows) {
  const list = (rows || [])
    .map((r) => ({ id: r.id, name: String(r.name ?? '') }))
    .filter((m) => m.id)
  if (list.length === 0) return false
  modulesCache = list
  writeCloudModulesLS(modulesCache)
  return true
}

function getModulesRaw() {
  try {
    const raw = localStorage.getItem(MODULES_KEY)
    const list = raw ? JSON.parse(raw) : null
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveModules(list) {
  try {
    localStorage.setItem(MODULES_KEY, JSON.stringify(list))
  } catch (_) {}
}

function ensureModulesLocal() {
  let list = getModulesRaw()
  if (list.length === 0) {
    list = [{ id: DEFAULT_MODULE_ID, name: '默认模组' }]
    saveModules(list)
    try {
      if (!localStorage.getItem(CURRENT_MODULE_KEY)) {
        localStorage.setItem(CURRENT_MODULE_KEY, DEFAULT_MODULE_ID)
      }
    } catch (_) {}
  }
  return list
}

export async function loadCampaignModulesFromSupabase() {
  if (!isSupabaseEnabled()) return
  try {
    let rows = await td.fetchCampaignModules()
    if (applyServerRows(rows)) return
    try {
      await td.insertCampaignModule(DEFAULT_MODULE_ID, '默认模组', 0)
    } catch (_) {
      /* 已存在等 */
    }
    rows = await td.fetchCampaignModules()
    if (applyServerRows(rows)) return
  } catch (e) {
    console.warn('[campaign_modules] 云端拉取失败', e)
  }
  const ls = readCloudModulesLS()
  if (ls.length > 0) {
    modulesCache = ls
    return
  }
  if (modulesCache.length > 0) {
    writeCloudModulesLS(modulesCache)
    return
  }
  modulesCache = [{ id: DEFAULT_MODULE_ID, name: '默认模组' }]
  writeCloudModulesLS(modulesCache)
}

export async function loadUserPrefsFromSupabase(owner) {
  if (!isSupabaseEnabled() || !owner) return
  const row = await td.fetchUserPrefs(owner)
  prefsByOwner[owner] = {
    current_module_id: row?.current_module_id ?? null,
    default_chars:
      row?.default_chars && typeof row.default_chars === 'object' && !Array.isArray(row.default_chars)
        ? { ...row.default_chars }
        : {},
  }
}

export function getDefaultCharIdFromPrefs(owner, moduleId) {
  if (!owner) return null
  const mod = moduleId ?? 'default'
  return prefsByOwner[owner]?.default_chars?.[mod] || null
}

export async function setDefaultCharInPrefs(owner, moduleId, charId) {
  if (!isSupabaseEnabled() || !owner) return
  if (!prefsByOwner[owner]) {
    prefsByOwner[owner] = { current_module_id: null, default_chars: {} }
  }
  const dc = { ...prefsByOwner[owner].default_chars }
  if (charId) dc[moduleId ?? 'default'] = charId
  else delete dc[moduleId ?? 'default']
  prefsByOwner[owner].default_chars = dc
  await td.upsertUserPrefs(owner, {
    current_module_id: prefsByOwner[owner].current_module_id,
    default_chars: dc,
  })
}

export function getModules() {
  if (isSupabaseEnabled()) {
    return modulesCache.length ? modulesCache : [{ id: DEFAULT_MODULE_ID, name: '默认模组' }]
  }
  ensureModulesLocal()
  return getModulesRaw()
}

/** React setState 须用新数组引用 */
export function getModulesSnapshot() {
  return getModules().map((m) => ({ id: m.id, name: m.name }))
}

export function getCurrentModuleId(ownerName) {
  if (isSupabaseEnabled()) {
    const list = getModules()
    const pref = ownerName ? prefsByOwner[ownerName] : null
    const id = pref?.current_module_id
    if (id && list.some((m) => m.id === id)) return id
    return list[0]?.id ?? DEFAULT_MODULE_ID
  }
  ensureModulesLocal()
  try {
    const id = localStorage.getItem(CURRENT_MODULE_KEY)
    const list = getModulesRaw()
    const exists = list.some((m) => m.id === id)
    return exists ? id : (list[0]?.id ?? DEFAULT_MODULE_ID)
  } catch {
    return DEFAULT_MODULE_ID
  }
}

export function setCurrentModuleId(id, ownerName) {
  if (isSupabaseEnabled() && ownerName) {
    if (!prefsByOwner[ownerName]) {
      prefsByOwner[ownerName] = { current_module_id: null, default_chars: {} }
    }
    prefsByOwner[ownerName].current_module_id = id
    td
      .upsertUserPrefs(ownerName, {
        current_module_id: id,
        default_chars: prefsByOwner[ownerName].default_chars,
      })
      .catch(() => {})
    return
  }
  if (isSupabaseEnabled()) {
    return
  }
  try {
    localStorage.setItem(CURRENT_MODULE_KEY, String(id))
  } catch (_) {}
}

export function addModule(name) {
  const trimmed = String(name || '').trim()
  const label = trimmed || `模组 ${getModules().length + 1}`
  if (isSupabaseEnabled()) {
    const id = 'mod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
    const sortOrder = modulesCache.length
    return td.insertCampaignModule(id, label, sortOrder).then(() => {
      let list = modulesCache.length ? modulesCache.map((m) => ({ ...m })) : readCloudModulesLS()
      if (!list.some((m) => m.id === id)) list = [...list, { id, name: label }]
      modulesCache = list
      writeCloudModulesLS(modulesCache)
      return loadCampaignModulesFromSupabase()
        .catch(() => {})
        .then(() => {
          if (!modulesCache.some((m) => m.id === id)) {
            modulesCache = list
            writeCloudModulesLS(modulesCache)
          }
          const row = modulesCache.find((m) => m.id === id)
          return row ? { ...row } : { id, name: label }
        })
    })
  }
  const list = getModulesRaw()
  const id = 'mod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
  list.push({ id, name: label })
  saveModules(list)
  return Promise.resolve({ id, name: label })
}

export function updateModule(id, name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return Promise.resolve(null)
  if (isSupabaseEnabled()) {
    return td.upsertCampaignModuleName(id, trimmed).then(() => {
      let list = (modulesCache.length ? modulesCache : readCloudModulesLS()).map((m) => ({ ...m }))
      const idx = list.findIndex((m) => m.id === id)
      if (idx >= 0) list[idx] = { ...list[idx], name: trimmed }
      else list.push({ id, name: trimmed })
      modulesCache = list
      writeCloudModulesLS(modulesCache)
      return loadCampaignModulesFromSupabase()
        .catch(() => {})
        .then(() => {
          const found = modulesCache.find((m) => m.id === id)
          if (!found || found.name !== trimmed) {
            modulesCache = list
            writeCloudModulesLS(modulesCache)
          }
          return modulesCache.find((m) => m.id === id) || { id, name: trimmed }
        })
    })
  }
  const list = getModulesRaw()
  const idx = list.findIndex((m) => m.id === id)
  if (idx === -1) return Promise.resolve(null)
  if (trimmed) list[idx].name = trimmed
  saveModules(list)
  return Promise.resolve(list[idx])
}

export function deleteModule(id, ownerName) {
  if (id === DEFAULT_MODULE_ID) return Promise.resolve(false)
  if (isSupabaseEnabled()) {
    if (modulesCache.length <= 1) return Promise.resolve(false)
    return td.deleteCampaignModule(id).then(() => {
      modulesCache = modulesCache.filter((m) => m.id !== id)
      writeCloudModulesLS(modulesCache)
      if (getCurrentModuleId(ownerName) === id) {
        const next = modulesCache[0]?.id ?? DEFAULT_MODULE_ID
        setCurrentModuleId(next, ownerName)
      }
      return true
    })
  }
  const list = getModulesRaw()
  if (list.length <= 1) return Promise.resolve(false)
  const next = list.filter((m) => m.id !== id)
  saveModules(next)
  if (getCurrentModuleId() === id) {
    setCurrentModuleId(next[0]?.id ?? DEFAULT_MODULE_ID)
  }
  return Promise.resolve(true)
}

export function reorderModules(orderedList) {
  if (!Array.isArray(orderedList) || orderedList.length === 0) return Promise.resolve()
  if (isSupabaseEnabled()) {
    const ids = new Set(modulesCache.map((m) => m.id))
    const valid = orderedList.filter((m) => m && ids.has(m.id))
    if (valid.length !== modulesCache.length) return Promise.resolve()
    modulesCache = valid.map((m) => ({ ...m }))
    writeCloudModulesLS(modulesCache)
    return td.replaceCampaignModuleOrder(valid)
  }
  const current = getModulesRaw()
  const ids = new Set(current.map((m) => m.id))
  const valid = orderedList.filter((m) => m && ids.has(m.id))
  if (valid.length !== current.length) return Promise.resolve()
  saveModules(valid)
  return Promise.resolve()
}
