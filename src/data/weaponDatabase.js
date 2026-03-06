/**
 * D&D 5e 本地武器库 - 下拉选择与自动填充数据源
 * 结构: id, name, type(近战/远程), damageDice, damageType, properties, baseStat(str/dex)
 */
export const WEAPON_DATABASE = [
  { id: 'rapier', name: '细剑 (Rapier)', type: '近战', damageDice: '1d8', damageType: '穿刺', properties: ['灵巧', '触及'], baseStat: 'dex' },
  { id: 'shortsword', name: '短剑 (Shortsword)', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['灵巧', '轻型'], baseStat: 'dex' },
  { id: 'dagger', name: '匕首 (Dagger)', type: '近战', damageDice: '1d4', damageType: '穿刺', properties: ['灵巧', '轻型', '投掷'], baseStat: 'dex' },
  { id: 'scimitar', name: '弯刀 (Scimitar)', type: '近战', damageDice: '1d6', damageType: '挥砍', properties: ['灵巧', '轻型'], baseStat: 'dex' },
  { id: 'longsword', name: '长剑 (Longsword)', type: '近战', damageDice: '1d8', damageType: '挥砍', properties: ['多用'], baseStat: 'str' },
  { id: 'greatsword', name: '巨剑 (Greatsword)', type: '近战', damageDice: '2d6', damageType: '挥砍', properties: ['双手', '重型'], baseStat: 'str' },
  { id: 'greataxe', name: '巨斧 (Greataxe)', type: '近战', damageDice: '1d12', damageType: '挥砍', properties: ['双手', '重型'], baseStat: 'str' },
  { id: 'battleaxe', name: '战斧 (Battleaxe)', type: '近战', damageDice: '1d8', damageType: '挥砍', properties: ['多用'], baseStat: 'str' },
  { id: 'warhammer', name: '战锤 (Warhammer)', type: '近战', damageDice: '1d8', damageType: '钝击', properties: ['多用'], baseStat: 'str' },
  { id: 'quarterstaff', name: '长棍 (Quarterstaff)', type: '近战', damageDice: '1d6', damageType: '钝击', properties: ['多用'], baseStat: 'str' },
  { id: 'handaxe', name: '手斧 (Handaxe)', type: '近战', damageDice: '1d6', damageType: '挥砍', properties: ['轻型', '投掷'], baseStat: 'str' },
  { id: 'javelin', name: '标枪 (Javelin)', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['投掷'], baseStat: 'str' },
  { id: 'hand_crossbow', name: '手弩 (Hand Crossbow)', type: '远程', damageDice: '1d6', damageType: '穿刺', properties: ['装填', '轻型'], baseStat: 'dex' },
  { id: 'light_crossbow', name: '轻弩 (Light Crossbow)', type: '远程', damageDice: '1d8', damageType: '穿刺', properties: ['装填', '双手'], baseStat: 'dex' },
  { id: 'heavy_crossbow', name: '重弩 (Heavy Crossbow)', type: '远程', damageDice: '1d10', damageType: '穿刺', properties: ['装填', '双手', '重型'], baseStat: 'dex' },
  { id: 'shortbow', name: '短弓 (Shortbow)', type: '远程', damageDice: '1d6', damageType: '穿刺', properties: ['双手', '弹药'], baseStat: 'dex' },
  { id: 'longbow', name: '长弓 (Longbow)', type: '远程', damageDice: '1d8', damageType: '穿刺', properties: ['双手', '弹药', '重型'], baseStat: 'dex' },
  { id: 'sling', name: '投索 (Sling)', type: '远程', damageDice: '1d4', damageType: '钝击', properties: ['弹药'], baseStat: 'dex' },
  { id: 'mace', name: '硬头锤 (Mace)', type: '近战', damageDice: '1d6', damageType: '钝击', properties: [], baseStat: 'str' },
  { id: 'spear', name: '矛 (Spear)', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['多用', '投掷'], baseStat: 'str' },
]

export function getWeaponById(id) {
  return WEAPON_DATABASE.find((w) => w.id === id) ?? null
}

/** 解析骰子字符串如 "2d6" 并投掷，返回 { total, rolls } */
export function rollDice(diceExpression) {
  const match = String(diceExpression).trim().match(/^(\d+)d(\d+)$/i)
  if (!match) return { total: 0, rolls: [] }
  const count = Math.min(parseInt(match[1], 10) || 0, 20)
  const sides = Math.min(Math.max(parseInt(match[2], 10) || 6, 2), 100)
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
  const total = rolls.reduce((s, r) => s + r, 0)
  return { total, rolls }
}
