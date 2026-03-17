/**
 * 模组（小队/战役）管理：区分不同小队的角色与仓库
 * 每个模组有独立的：角色列表、仓库、金库、制作项目
 */

const MODULES_KEY = 'dnd_modules'
const CURRENT_MODULE_KEY = 'dnd_current_module_id'

const DEFAULT_MODULE_ID = 'default'

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

/** 初始化：若无模组则创建默认模组 */
function ensureModules() {
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

/** 获取所有模组 */
export function getModules() {
  ensureModules()
  return getModulesRaw()
}

/** 获取当前选中的模组 ID */
export function getCurrentModuleId() {
  ensureModules()
  try {
    const id = localStorage.getItem(CURRENT_MODULE_KEY)
    const list = getModulesRaw()
    const exists = list.some((m) => m.id === id)
    return exists ? id : (list[0]?.id ?? DEFAULT_MODULE_ID)
  } catch {
    return DEFAULT_MODULE_ID
  }
}

/** 设置当前模组 */
export function setCurrentModuleId(id) {
  try {
    localStorage.setItem(CURRENT_MODULE_KEY, String(id))
  } catch (_) {}
}

/** 新增模组 */
export function addModule(name) {
  const list = getModulesRaw()
  const trimmed = String(name || '').trim()
  const label = trimmed || `模组 ${list.length + 1}`
  const id = 'mod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
  list.push({ id, name: label })
  saveModules(list)
  return { id, name: label }
}

/** 更新模组名称 */
export function updateModule(id, name) {
  const list = getModulesRaw()
  const idx = list.findIndex((m) => m.id === id)
  if (idx === -1) return null
  const trimmed = String(name || '').trim()
  if (trimmed) list[idx].name = trimmed
  saveModules(list)
  return list[idx]
}

/** 删除模组（不允许删除当前模组时的最后一个模组） */
export function deleteModule(id) {
  if (id === DEFAULT_MODULE_ID) return false
  const list = getModulesRaw()
  if (list.length <= 1) return false
  const next = list.filter((m) => m.id !== id)
  saveModules(next)
  if (getCurrentModuleId() === id) {
    setCurrentModuleId(next[0]?.id ?? DEFAULT_MODULE_ID)
  }
  return true
}

/** 拖拽重排模组顺序；传入新顺序的模组数组（与 getModules() 元素一致，仅顺序不同） */
export function reorderModules(orderedList) {
  if (!Array.isArray(orderedList) || orderedList.length === 0) return
  const current = getModulesRaw()
  const ids = new Set(current.map((m) => m.id))
  const valid = orderedList.filter((m) => m && ids.has(m.id))
  if (valid.length !== current.length) return
  saveModules(valid)
}
