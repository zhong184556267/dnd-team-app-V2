/**
 * D&D 5e 本地武器库 - 下拉选择与自动填充数据源
 * 结构: id, name, type(近战/远程), damageDice, damageType, properties, baseStat(str/dex)
 */
export const WEAPON_DATABASE = [
  { id: 'rapier', name: '细剑', type: '近战', damageDice: '1d8', damageType: '穿刺', properties: ['灵巧', '触及'], baseStat: 'dex' },
  { id: 'shortsword', name: '短剑', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['灵巧', '轻型'], baseStat: 'dex' },
  { id: 'dagger', name: '匕首', type: '近战', damageDice: '1d4', damageType: '穿刺', properties: ['灵巧', '轻型', '投掷'], baseStat: 'dex' },
  { id: 'scimitar', name: '弯刀', type: '近战', damageDice: '1d6', damageType: '挥砍', properties: ['灵巧', '轻型'], baseStat: 'dex' },
  { id: 'longsword', name: '长剑', type: '近战', damageDice: '1d8', damageType: '挥砍', properties: ['多用'], baseStat: 'str' },
  { id: 'greatsword', name: '巨剑', type: '近战', damageDice: '2d6', damageType: '挥砍', properties: ['双手', '重型'], baseStat: 'str' },
  { id: 'greataxe', name: '巨斧', type: '近战', damageDice: '1d12', damageType: '挥砍', properties: ['双手', '重型'], baseStat: 'str' },
  { id: 'battleaxe', name: '战斧', type: '近战', damageDice: '1d8', damageType: '挥砍', properties: ['多用'], baseStat: 'str' },
  { id: 'warhammer', name: '战锤', type: '近战', damageDice: '1d8', damageType: '钝击', properties: ['多用'], baseStat: 'str' },
  { id: 'quarterstaff', name: '长棍', type: '近战', damageDice: '1d6', damageType: '钝击', properties: ['多用'], baseStat: 'str' },
  { id: 'handaxe', name: '手斧', type: '近战', damageDice: '1d6', damageType: '挥砍', properties: ['轻型', '投掷'], baseStat: 'str' },
  { id: 'javelin', name: '标枪', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['投掷'], baseStat: 'str' },
  { id: 'hand_crossbow', name: '手弩', type: '远程', damageDice: '1d6', damageType: '穿刺', properties: ['装填', '轻型'], baseStat: 'dex' },
  { id: 'light_crossbow', name: '轻弩', type: '远程', damageDice: '1d8', damageType: '穿刺', properties: ['装填', '双手'], baseStat: 'dex' },
  { id: 'heavy_crossbow', name: '重弩', type: '远程', damageDice: '1d10', damageType: '穿刺', properties: ['装填', '双手', '重型'], baseStat: 'dex' },
  { id: 'shortbow', name: '短弓', type: '远程', damageDice: '1d6', damageType: '穿刺', properties: ['双手', '弹药'], baseStat: 'dex' },
  { id: 'longbow', name: '长弓', type: '远程', damageDice: '1d8', damageType: '穿刺', properties: ['双手', '弹药', '重型'], baseStat: 'dex' },
  { id: 'sling', name: '投索', type: '远程', damageDice: '1d4', damageType: '钝击', properties: ['弹药'], baseStat: 'dex' },
  { id: 'mace', name: '硬头锤', type: '近战', damageDice: '1d6', damageType: '钝击', properties: [], baseStat: 'str' },
  { id: 'spear', name: '矛', type: '近战', damageDice: '1d6', damageType: '穿刺', properties: ['多用', '投掷'], baseStat: 'str' },
]

export function getWeaponById(id) {
  return WEAPON_DATABASE.find((w) => w.id === id) ?? null
}

/**
 * 解析战斗伤害骰串：XdY 或 XdY+N / XdY-N（法术位等常写成 13d6+13）
 * 不含多段逗号，重击倍骰请用 rollCombatDicePool 两次再合并。
 */
export function parseCombatDiceExpression(expr) {
  let s = String(expr ?? '').trim()
  const hashIdx = s.lastIndexOf(' #')
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()
  s = s.replace(/\s+/g, '')
  /** 整行如 2d6+5钝击：只取前导 XdY±N，便于快捷投掷 */
  const head = /^(\d+d\d+(?:[+-]\d+)?)/i.exec(s)
  if (head) s = head[1]
  const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(s)
  if (!m) return null
  const count = Math.min(Math.max(parseInt(m[1], 10) || 0, 0), 100)
  const sides = Math.min(Math.max(parseInt(m[2], 10) || 6, 2), 100)
  const flatMod = m[3] ? parseInt(m[3], 10) : 0
  if (count < 1) return null
  return { count, sides, flatMod }
}

/** 投一轮骰池 + 末尾固定加值（flat 不参与「再投一轮」） */
export function rollCombatDicePool(expr) {
  const p = parseCombatDiceExpression(expr)
  if (!p) return { rolls: [], diceSum: 0, flatMod: 0, parsed: null }
  const rolls = Array.from({ length: p.count }, () => Math.floor(Math.random() * p.sides) + 1)
  const diceSum = rolls.reduce((s, n) => s + n, 0)
  return { rolls, diceSum, flatMod: p.flatMod, parsed: p }
}

/** 解析骰子字符串如 "2d6" 或 "13d6+13" 并投掷；total 含末尾加值（单轮投掷用） */
export function rollDice(diceExpression) {
  const pool = rollCombatDicePool(diceExpression)
  if (!pool.parsed) return { total: 0, rolls: [] }
  return { total: pool.diceSum + pool.flatMod, rolls: pool.rolls }
}
