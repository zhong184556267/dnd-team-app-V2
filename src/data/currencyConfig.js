/**
 * D&D 2024 + 自定义货币配置
 * 汇率以 gp（金币）为基准：baseRate = 该货币 1 单位可兑换的 gp 数
 * 换算公式：目标数量 = (源数量 × 源 baseRate) / 目标 baseRate
 */

/** 1 奥拉 = 多少 gp（可在此修改） */
export const AURUM_PER_GP = 100

/** 1 磅晶石 = 多少 奥拉（推导：1 lb = 5000 au = 500000 gp when AURUM_PER_GP=100） */
export const GEM_LB_PER_AURUM = 5000

const gp = 1
const pp = 10
const sp = 1 / 10
const cp = 1 / 10
const au = AURUM_PER_GP
const gemLb = AURUM_PER_GP * GEM_LB_PER_AURUM // 1 磅晶石 = 500000 gp

/**
 * 货币配置：id, 名称, 缩写, 相对 gp 的 baseRate, 样式
 * baseRate：1 单位该货币 = baseRate 单位 gp
 */
export const CURRENCY_CONFIG = [
  {
    id: 'cp',
    name: '铜币',
    short: 'cp',
    baseRate: cp,
    style: 'muted',
    order: 1,
  },
  {
    id: 'sp',
    name: '银币',
    short: 'sp',
    baseRate: sp,
    style: 'muted',
    order: 2,
  },
  {
    id: 'gp',
    name: '金币',
    short: 'gp',
    baseRate: gp,
    style: 'gold',
    order: 3,
  },
  {
    id: 'pp',
    name: '铂金币',
    short: 'pp',
    baseRate: pp,
    style: 'standard',
    order: 4,
  },
  {
    id: 'au',
    name: '奥拉',
    short: 'au',
    baseRate: au,
    style: 'aurum',
    order: 5,
  },
  {
    id: 'gem_lb',
    name: '晶石',
    unit: '磅',
    short: '磅',
    baseRate: gemLb,
    style: 'crystal',
    order: 6,
  },
].sort((a, b) => a.order - b.order)

export const CURRENCY_IDS = CURRENCY_CONFIG.map((c) => c.id)

/** 默认空余额（所有货币为 0） */
export function getEmptyBalances() {
  return CURRENCY_IDS.reduce((acc, id) => ({ ...acc, [id]: 0 }), {})
}

/** 按 id 取配置 */
export function getCurrencyById(id) {
  return CURRENCY_CONFIG.find((c) => c.id === id) ?? null
}

/** 界面显示用：完整中文名称（如 铜币、金币、晶石（磅）） */
export function getCurrencyDisplayName(c) {
  if (!c) return ''
  return c.unit ? `${c.name}（${c.unit}）` : c.name
}

/** 钱包总估值（按 gp 计）：各货币数量 × 其 baseRate 后求和 */
export function getWalletValueGp(wallet) {
  if (!wallet || typeof wallet !== 'object') return 0
  return CURRENCY_CONFIG.reduce((sum, c) => sum + (Number(wallet[c.id]) || 0) * c.baseRate, 0)
}
