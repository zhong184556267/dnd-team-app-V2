/**
 * 物品/武器资料表
 * 结构：id, 类别, 名称(可选，无则用类别), 攻击, 附注, 伤害, 重量, 价格, 详细介绍
 * 显示名：名称 || 类别
 */

const CUSTOM_ITEMS_KEY = 'dnd_custom_items'

/** 内置武器表（参考 D&D 5e 武器表） */
export const ITEM_DATABASE = [
  { id: 'club', 类别: '木棍 (Club)', 攻击: '1d4 钝击', 附注: '轻型', 伤害: '钝击', 重量: '2磅', 价格: '1SP', 详细介绍: '' },
  { id: 'dagger', 类别: '匕首 (Dagger)', 攻击: '1d4 穿刺', 附注: '灵巧, 轻型, 投掷 (射程20/60)', 伤害: '穿刺', 重量: '1磅', 价格: '2GP', 详细介绍: '' },
  { id: 'greatclub', 类别: '大木棍 (Greatclub)', 攻击: '1d8 钝击', 附注: '双手', 伤害: '钝击', 重量: '10磅', 价格: '2SP', 详细介绍: '' },
  { id: 'handaxe', 类别: '手斧 (Handaxe)', 攻击: '1d6 挥砍', 附注: '轻型, 投掷 (射程20/60)', 伤害: '挥砍', 重量: '2磅', 价格: '5GP', 详细介绍: '' },
  { id: 'javelin', 类别: '标枪 (Javelin)', 攻击: '1d6 穿刺', 附注: '投掷 (射程30/120)', 伤害: '穿刺', 重量: '2磅', 价格: '5SP', 详细介绍: '' },
  { id: 'light_hammer', 类别: '轻锤 (Light Hammer)', 攻击: '1d4 钝击', 附注: '轻型, 投掷 (射程20/60)', 伤害: '钝击', 重量: '2磅', 价格: '2GP', 详细介绍: '' },
  { id: 'mace', 类别: '硬头锤 (Mace)', 攻击: '1d6 钝击', 附注: '—', 伤害: '钝击', 重量: '4磅', 价格: '5GP', 详细介绍: '' },
  { id: 'quarterstaff', 类别: '长棍 (Quarterstaff)', 攻击: '1d6 钝击', 附注: '多用 (1d8)', 伤害: '钝击', 重量: '4磅', 价格: '2SP', 详细介绍: '' },
  { id: 'sickle', 类别: '镰刀 (Sickle)', 攻击: '1d4 挥砍', 附注: '轻型', 伤害: '挥砍', 重量: '2磅', 价格: '1GP', 详细介绍: '' },
  { id: 'spear', 类别: '矛 (Spear)', 攻击: '1d6 穿刺', 附注: '多用 (1d8), 投掷 (射程20/60)', 伤害: '穿刺', 重量: '3磅', 价格: '1GP', 详细介绍: '' },
  { id: 'light_crossbow', 类别: '轻弩 (Light Crossbow)', 攻击: '1d8 穿刺', 附注: '装填, 双手, 弹药 (射程80/320)', 伤害: '穿刺', 重量: '5磅', 价格: '25GP', 详细介绍: '' },
  { id: 'dart', 类别: '飞镖 (Dart)', 攻击: '1d4 穿刺', 附注: '灵巧, 投掷 (射程20/60)', 伤害: '穿刺', 重量: '1/4磅', 价格: '5CP', 详细介绍: '' },
  { id: 'shortbow', 类别: '短弓 (Shortbow)', 攻击: '1d6 穿刺', 附注: '双手, 弹药 (射程80/320)', 伤害: '穿刺', 重量: '2磅', 价格: '25GP', 详细介绍: '' },
  { id: 'sling', 类别: '投索 (Sling)', 攻击: '1d4 钝击', 附注: '弹药 (射程30/120)', 伤害: '钝击', 重量: '—', 价格: '1SP', 详细介绍: '' },
  { id: 'battleaxe', 类别: '战斧 (Battleaxe)', 攻击: '1d8 挥砍', 附注: '多用 (1d10)', 伤害: '挥砍', 重量: '4磅', 价格: '10GP', 详细介绍: '' },
  { id: 'flail', 类别: '链枷 (Flail)', 攻击: '1d8 钝击', 附注: '—', 伤害: '钝击', 重量: '2磅', 价格: '10GP', 详细介绍: '' },
  { id: 'glaive', 类别: '长柄刀 (Glaive)', 攻击: '1d10 挥砍', 附注: '触及, 双手, 重型', 伤害: '挥砍', 重量: '6磅', 价格: '20GP', 详细介绍: '' },
  { id: 'greataxe', 类别: '巨斧 (Greataxe)', 攻击: '1d12 挥砍', 附注: '双手, 重型', 伤害: '挥砍', 重量: '7磅', 价格: '30GP', 详细介绍: '' },
  { id: 'greatsword', 类别: '巨剑 (Greatsword)', 攻击: '2d6 挥砍', 附注: '双手, 重型', 伤害: '挥砍', 重量: '6磅', 价格: '50GP', 详细介绍: '' },
  { id: 'halberd', 类别: '戟 (Halberd)', 攻击: '1d10 挥砍', 附注: '触及, 双手, 重型', 伤害: '挥砍', 重量: '6磅', 价格: '20GP', 详细介绍: '' },
  { id: 'lance', 类别: '长枪 (Lance)', 攻击: '1d12 穿刺', 附注: '触及, 特殊', 伤害: '穿刺', 重量: '6磅', 价格: '10GP', 详细介绍: '' },
  { id: 'longsword', 类别: '长剑 (Longsword)', 攻击: '1d8 挥砍', 附注: '多用 (1d10)', 伤害: '挥砍', 重量: '3磅', 价格: '15GP', 详细介绍: '' },
  { id: 'maul', 类别: '大锤 (Maul)', 攻击: '2d6 钝击', 附注: '双手, 重型', 伤害: '钝击', 重量: '10磅', 价格: '10GP', 详细介绍: '' },
  { id: 'morningstar', 类别: '晨星 (Morningstar)', 攻击: '1d8 穿刺', 附注: '—', 伤害: '穿刺', 重量: '4磅', 价格: '15GP', 详细介绍: '' },
  { id: 'pike', 类别: '长枪 (Pike)', 攻击: '1d10 穿刺', 附注: '触及, 双手, 重型', 伤害: '穿刺', 重量: '18磅', 价格: '5GP', 详细介绍: '' },
  { id: 'rapier', 类别: '细剑 (Rapier)', 攻击: '1d8 穿刺', 附注: '灵巧, 触及', 伤害: '穿刺', 重量: '2磅', 价格: '25GP', 详细介绍: '' },
  { id: 'scimitar', 类别: '弯刀 (Scimitar)', 攻击: '1d6 挥砍', 附注: '灵巧, 轻型', 伤害: '挥砍', 重量: '3磅', 价格: '25GP', 详细介绍: '' },
  { id: 'shortsword', 类别: '短剑 (Shortsword)', 攻击: '1d6 穿刺', 附注: '灵巧, 轻型', 伤害: '穿刺', 重量: '2磅', 价格: '10GP', 详细介绍: '' },
  { id: 'trident', 类别: '三叉戟 (Trident)', 攻击: '1d6 穿刺', 附注: '投掷 (射程20/60), 多用 (1d8)', 伤害: '穿刺', 重量: '4磅', 价格: '5GP', 详细介绍: '' },
  { id: 'war_pick', 类别: '战镐 (War Pick)', 攻击: '1d8 穿刺', 附注: '—', 伤害: '穿刺', 重量: '2磅', 价格: '5GP', 详细介绍: '' },
  { id: 'warhammer', 类别: '战锤 (Warhammer)', 攻击: '1d8 钝击', 附注: '多用 (1d10)', 伤害: '钝击', 重量: '2磅', 价格: '15GP', 详细介绍: '' },
  { id: 'hand_crossbow', 类别: '手弩 (Hand Crossbow)', 攻击: '1d6 穿刺', 附注: '装填, 轻型, 弹药 (射程30/120)', 伤害: '穿刺', 重量: '3磅', 价格: '75GP', 详细介绍: '' },
  { id: 'heavy_crossbow', 类别: '重弩 (Heavy Crossbow)', 攻击: '1d10 穿刺', 附注: '装填, 双手, 重型, 弹药 (射程100/400)', 伤害: '穿刺', 重量: '18磅', 价格: '50GP', 详细介绍: '' },
  { id: 'longbow', 类别: '长弓 (Longbow)', 攻击: '1d8 穿刺', 附注: '双手, 弹药 (射程150/600), 重型', 伤害: '穿刺', 重量: '2磅', 价格: '50GP', 详细介绍: '' },
  { id: 'net', 类别: '网 (Net)', 攻击: '—', 附注: '特殊, 投掷 (射程5/15)', 伤害: '—', 重量: '3磅', 价格: '1GP', 详细介绍: '' },
]

/** 显示名：有自定义名称用名称，否则用类别 */
export function getItemDisplayName(item) {
  if (!item) return '—'
  return (item.名称 && String(item.名称).trim()) ? String(item.名称).trim() : (item.类别 || '—')
}

/** 根据 id 查找（先查内置，再查自定义） */
export function getItemById(id) {
  const built = ITEM_DATABASE.find((x) => x.id === id)
  if (built) return { ...built }
  const custom = getCustomItems().find((x) => x.id === id)
  return custom ? { ...custom } : null
}

/** 自定义物品列表（localStorage） */
export function getCustomItems() {
  try {
    const raw = localStorage.getItem(CUSTOM_ITEMS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveCustomItems(list) {
  try {
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(list))
  } catch (_) {}
}

/** 供下拉使用的完整物品列表（内置 + 自定义），显示名用于选项文案 */
export function getItemList() {
  const custom = getCustomItems()
  return [
    ...ITEM_DATABASE.map((x) => ({ ...x, _display: getItemDisplayName(x) })),
    ...custom.map((x) => ({ ...x, _display: getItemDisplayName(x) })),
  ]
}

/** 新增自定义物品；返回新项（含 id） */
export function addCustomItem(item) {
  const list = getCustomItems()
  const id = 'custom_' + Date.now()
  const newItem = {
    id,
    类别: item.类别?.trim() || '自定义',
    名称: item.名称?.trim() || '',
    攻击: item.攻击?.trim() || '',
    附注: item.附注?.trim() || '',
    伤害: item.伤害?.trim() || '',
    重量: item.重量?.trim() || '',
    价格: item.价格?.trim() || '',
    详细介绍: item.详细介绍?.trim() || '',
  }
  list.push(newItem)
  saveCustomItems(list)
  return newItem
}

/** 更新自定义物品 */
export function updateCustomItem(id, patch) {
  const list = getCustomItems()
  const idx = list.findIndex((x) => x.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch }
  saveCustomItems(list)
  return list[idx]
}

/** 删除自定义物品 */
export function removeCustomItem(id) {
  const list = getCustomItems().filter((x) => x.id !== id)
  saveCustomItems(list)
  return true
}
