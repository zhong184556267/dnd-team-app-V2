const STORAGE_KEY = 'starlight_characters'

/** 属性调整值 */
export function abilityModifier(value) {
  return Math.floor(((Number(value) || 10) - 10) / 2)
}

/** D&D 5e 熟练加值：按等级 1–20 查表 */
const PROFICIENCY_BY_LEVEL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]
export function proficiencyBonus(level) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  return PROFICIENCY_BY_LEVEL[L - 1] ?? 2
}

const defaultAbilities = () => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })

export function getCharacters(ownerName, isAdmin) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (isAdmin) return list
    return list.filter((c) => c.owner === ownerName)
  } catch {
    return []
  }
}

/** 获取所有角色（用于首页展示，不按创建人过滤） */
export function getAllCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function getCharacter(id) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  return list.find((c) => c.id === id) ?? null
}

function saveCharacters(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function addCharacter(ownerName, data = {}) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  const id = crypto.randomUUID()
  const character = {
    id,
    owner: ownerName,
    name: data.name?.trim() || '未命名',
    'class': data['class']?.trim() || '',
    classLevel: typeof data.classLevel === 'number' ? data.classLevel : 1,
    multiclass: Array.isArray(data.multiclass) ? data.multiclass : [],
    prestige: Array.isArray(data.prestige) ? data.prestige : [],
    level: 1,
    xp: 0,
    hp: { current: 0, max: 0, temp: 0 },
    abilities: data.abilities ?? defaultAbilities(),
    savingThrows: data.savingThrows ?? { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skills: data.skills ?? {},
    avatar: data.avatar ?? null,
    appearance: data.appearance ?? {},
    inventory: data.inventory ?? [],
    wallet: data.wallet ?? {},
    equipment: data.equipment ?? {},
    buffs: data.buffs ?? [],
    notes: data.notes ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  list.push(character)
  saveCharacters(list)
  return character
}

export function updateCharacter(id, patch) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() }
  saveCharacters(list)
  return list[idx]
}

export function deleteCharacter(id) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  const next = list.filter((c) => c.id !== id)
  if (next.length === list.length) return false
  saveCharacters(next)
  return true
}
