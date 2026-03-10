/**
 * 魔法物品制作工厂：制作项目列表（localStorage）
 * 结构：{ id, 类型, 物品名称, 详细介绍?, 完成度, 制作天数, 消耗金额, 消耗经验, 制作需求人, 公式? }
 */

const CRAFTING_KEY = 'dnd_magic_crafting'

export const MAGIC_ITEM_TYPES = [
  { id: 'weapon_armor', label: '武器&盔甲' },
  { id: 'wand', label: '魔杖' },
  { id: 'staff', label: '法杖' },
  { id: 'rod', label: '权杖' },
  { id: 'wondrous', label: '奇物' },
  { id: 'ring', label: '戒指' },
  { id: 'scroll', label: '卷轴' },
  { id: 'potion', label: '药水' },
]

function getRaw() {
  try {
    const raw = localStorage.getItem(CRAFTING_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(CRAFTING_KEY, JSON.stringify(list))
  } catch (_) {}
}

/** 获取所有制作项目 */
export function getCraftingProjects() {
  return getRaw()
}

/** 新增制作项目 */
export function addCraftingProject(project) {
  const list = getRaw()
  const id = 'craft_' + Date.now()
  const entry = {
    id,
    类型: project.类型 ?? MAGIC_ITEM_TYPES[0].id,
    物品名称: project.物品名称?.trim() ?? '',
    详细介绍: project.详细介绍?.trim() ?? '',
    完成度: Math.min(100, Math.max(0, Number(project.完成度) || 0)),
    制作天数: Math.max(0, Number(project.制作天数) || 0),
    消耗金额: project.消耗金额?.trim() ?? '',
    材料费用: project.材料费用?.trim() ?? '',
    消耗经验: Math.max(0, Number(project.消耗经验) || 0),
    制作需求人: project.制作需求人?.trim() ?? '',
    ...(project.所含法术环级 != null ? { 所含法术环级: Number(project.所含法术环级) || 0 } : {}),
    ...(project.公式 != null ? { 公式: project.公式 } : {}),
  }
  list.push(entry)
  save(list)
  return list
}

/** 更新制作项目 */
export function updateCraftingProject(index, updates) {
  const list = getRaw()
  if (index < 0 || index >= list.length) return list
  const next = [...list]
  const cur = next[index]
  const patch = { ...updates }
  if (patch.完成度 != null) patch.完成度 = Math.min(100, Math.max(0, Number(patch.完成度) || 0))
  if (patch.制作天数 != null) patch.制作天数 = Math.max(0, Number(patch.制作天数) || 0)
  if (patch.消耗经验 != null) patch.消耗经验 = Math.max(0, Number(patch.消耗经验) || 0)
  next[index] = { ...cur, ...patch }
  save(next)
  return next
}

/** 删除制作项目 */
export function removeCraftingProject(index) {
  const list = getRaw()
  if (index < 0 || index >= list.length) return list
  const next = list.filter((_, i) => i !== index)
  save(next)
  return next
}
