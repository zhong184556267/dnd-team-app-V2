/**
 * 魔法物品制作工厂：选择类型、填写物品信息与制作进度，完成后可存入角色
 */
import { useState, useEffect, Fragment } from 'react'
import { Package, Pencil, Trash2 } from 'lucide-react'
import {
  getCraftingProjects,
  addCraftingProject,
  updateCraftingProject,
  removeCraftingProject,
  MAGIC_ITEM_TYPES,
} from '../lib/craftingStore'
import { getAllCharacters, updateCharacter } from '../lib/characterStore'
import { inputClass, textareaClass } from '../lib/inputStyles'

/** 自动计算字段：无描边 */
const autoCalcClass = 'border-0 bg-gray-700/50 cursor-default'

/** 公式占位：按类型显示，后续可配置 */
function getFormulaPlaceholder(typeId) {
  return '公式待配置'
}

/** 从消耗金额字符串解析数字（如 "500 GP" -> 500） */
function parseCostFromString(str) {
  if (!str || typeof str !== 'string') return 0
  const m = str.trim().match(/[\d.]+/)
  return m ? parseFloat(m[0]) || 0 : 0
}

/** 制作天数公式：成本费用 / 1000，向上取整为整数天 */
function calcCraftingDays(costStr) {
  const cost = parseCostFromString(costStr)
  return cost <= 0 ? 0 : Math.ceil(cost / 1000)
}

/** 药水：施法者等级 = 能使用该环位法术的最低等级（0环=1级，1环=1级，2环=3级... 即 环级*2-1，0环取1） */
function calcMinCasterLevel(法术环级) {
  const lv = Math.max(0, Math.min(9, Number(法术环级) || 0))
  return lv === 0 ? 1 : lv * 2 - 1
}

/** 药水公式：交易价格 = 所含法术环级 × 施法者等级 × 50 GP */
function calcPotionMarketPrice(法术环级) {
  const sl = Math.max(0, Number(法术环级) || 0)
  const cl = calcMinCasterLevel(sl)
  return sl * cl * 50
}

/** 药水：制作成本 = 交易价格 / 2 */
function calcPotionCraftCost(marketPrice) {
  return Math.floor(marketPrice / 2)
}

/** 药水：消耗经验 = 交易价格 / 25 */
function calcPotionXpCost(marketPrice) {
  return Math.floor(marketPrice / 25)
}

export default function MagicCraftingPanel() {
  const [projects, setProjects] = useState([])
  const [expandedIndex, setExpandedIndex] = useState(null)
  // 新建表单
  const [new类型, setNew类型] = useState(MAGIC_ITEM_TYPES[0].id)
  const [new物品名称, setNew物品名称] = useState('')
  const [new详细介绍, setNew详细介绍] = useState('')
  const [new制作天数, setNew制作天数] = useState(0)
  const [new消耗金额, setNew消耗金额] = useState('')
  const [new材料费用, setNew材料费用] = useState('')
  const [new消耗经验, setNew消耗经验] = useState(0)
  const [new制作需求人, setNew制作需求人] = useState('')
  const [new所含法术环级, setNew所含法术环级] = useState(1)
  // 存入角色
  const [depositProjectIndex, setDepositProjectIndex] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')

  const characters = getAllCharacters()

  const refresh = () => setProjects(getCraftingProjects())

  useEffect(() => {
    refresh()
  }, [])

  const handleAdd = () => {
    const name = new物品名称?.trim()
    if (!name) return
    const isPotion = new类型 === 'potion'
    let costStr = new消耗金额
    let xp = new消耗经验
    if (isPotion) {
      const marketPrice = calcPotionMarketPrice(new所含法术环级)
      costStr = `${calcPotionCraftCost(marketPrice)} GP`
      xp = calcPotionXpCost(marketPrice)
    }
    const days = calcCraftingDays(costStr)
    addCraftingProject({
      类型: new类型,
      物品名称: name,
      详细介绍: new详细介绍,
      制作天数: days,
      消耗金额: costStr,
      材料费用: new材料费用,
      消耗经验: xp,
      制作需求人: new制作需求人,
      ...(isPotion ? { 所含法术环级: new所含法术环级 } : {}),
    })
    refresh()
    setNew物品名称('')
    setNew详细介绍('')
    setNew制作天数(0)
    setNew消耗金额('')
    setNew材料费用('')
    setNew消耗经验(0)
    setNew制作需求人('')
    setNew所含法术环级(1)
  }

  const handleUpdate = (index, patch) => {
    updateCraftingProject(index, patch)
    refresh()
  }

  const handleRemove = (index) => {
    removeCraftingProject(index)
    refresh()
    if (expandedIndex === index) setExpandedIndex(null)
    else if (expandedIndex != null && expandedIndex > index) setExpandedIndex(expandedIndex - 1)
  }

  const confirmDeposit = () => {
    if (depositProjectIndex == null || !depositCharId) return
    const p = projects[depositProjectIndex]
    if (!p) {
      setDepositProjectIndex(null)
      return
    }
    const char = characters.find((c) => c.id === depositCharId)
    if (!char) {
      setDepositProjectIndex(null)
      return
    }
    const inv = char.inventory ?? []
    const entry = {
      id: 'inv_' + Date.now(),
      name: p.物品名称?.trim() || '未命名魔法物品',
      详细介绍: p.详细介绍?.trim() ?? '',
      qty: 1,
    }
    updateCharacter(depositCharId, { inventory: [...inv, entry] })
    removeCraftingProject(depositProjectIndex)
    refresh()
    setDepositProjectIndex(null)
    setDepositCharId('')
  }

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 space-y-4">
      <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">魔法物品制作工厂</h2>

      {/* 新建制作项 */}
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 space-y-3">
        <p className="text-dnd-text-muted text-xs">选择魔法物品类型并填写物品信息，创建制作项（公式后续配置）</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-dnd-text-muted text-xs mb-1">魔法物品类型</label>
            <select
              value={new类型}
              onChange={(e) => setNew类型(e.target.value)}
              className={inputClass + ' w-full h-9'}
            >
              {MAGIC_ITEM_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="text-dnd-text-muted text-[10px] mt-0.5">
              {new类型 === 'potion' ? '交易价=法术环级×最低施法者等级×50GP；成本=交易价/2；经验=交易价/25' : `公式：${getFormulaPlaceholder(new类型)}`}
            </p>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-dnd-text-muted text-xs mb-1">物品名称</label>
            <input
              type="text"
              value={new物品名称}
              onChange={(e) => setNew物品名称(e.target.value)}
              placeholder="手动输入魔法物品名称"
              className={inputClass + ' w-full h-9'}
            />
          </div>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">详细描述（可选）</label>
          <textarea
            value={new详细介绍}
            onChange={(e) => setNew详细介绍(e.target.value)}
            placeholder="效果、说明等"
            rows={2}
            className={textareaClass + ' w-full'}
          />
        </div>
        {new类型 === 'potion' ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">所含法术环级</label>
              <input type="number" min={0} max={9} value={new所含法术环级} onChange={(e) => setNew所含法术环级(Math.max(0, Math.min(9, parseInt(e.target.value, 10) || 0)))} className={inputClass + ' h-9 w-16'} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">施法者等级</label>
              <input type="text" value={calcMinCasterLevel(new所含法术环级) + '（自动）'} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">材料费用</label>
              <input type="text" value={new材料费用} onChange={(e) => setNew材料费用(e.target.value)} placeholder="如：100 GP" className={inputClass + ' h-9 w-24'} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">交易价格</label>
              <input type="text" value={`${calcPotionMarketPrice(new所含法术环级)} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">制作成本</label>
              <input type="text" value={`${calcPotionCraftCost(calcPotionMarketPrice(new所含法术环级))} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">制作天数</label>
              <input type="number" min={0} value={calcCraftingDays(String(calcPotionCraftCost(calcPotionMarketPrice(new所含法术环级))))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} title="成本/1000" />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label>
              <input type="number" min={0} value={calcPotionXpCost(calcPotionMarketPrice(new所含法术环级))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">消耗金额</label>
              <input type="text" value={new消耗金额} onChange={(e) => setNew消耗金额(e.target.value)} placeholder="如：500 GP" className={inputClass + ' h-9 w-24'} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">材料费用</label>
              <input type="text" value={new材料费用} onChange={(e) => setNew材料费用(e.target.value)} placeholder="如：100 GP" className={inputClass + ' h-9 w-24'} />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">制作天数</label>
              <input type="number" min={0} value={new消耗金额 ? calcCraftingDays(new消耗金额) : 0} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} title="成本/1000" />
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label>
              <input type="number" min={0} value={new消耗经验} onChange={(e) => setNew消耗经验(parseInt(e.target.value, 10) || 0)} className={inputClass + ' h-9 w-16'} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">制作需求人</label>
          <select value={new制作需求人} onChange={(e) => setNew制作需求人(e.target.value)} className={inputClass + ' h-9 max-w-xs'}>
            <option value="">— 选择角色 —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={handleAdd} disabled={!new物品名称?.trim()} className="h-9 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          添加制作项
        </button>
      </div>

      {/* 制作列表 */}
      <div className="rounded border border-gray-600 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider">
              <th className="text-left py-1.5 px-2 font-semibold">类型</th>
              <th className="text-left py-1.5 px-2 font-semibold">物品名称</th>
              <th className="text-right py-1.5 px-1.5 w-14">天数</th>
              <th className="text-left py-1.5 px-1.5 w-20">消耗金额</th>
              <th className="text-left py-1.5 px-1.5 w-16">材料费用</th>
              <th className="text-right py-1.5 px-1.5 w-12">经验</th>
              <th className="text-left py-1.5 px-1.5 min-w-[4rem]">制作需求人</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-dnd-text-muted text-sm">暂无制作项，请在上方添加</td>
              </tr>
            )}
            {projects.map((p, i) => {
              const isExpanded = expandedIndex === i
              const typeLabel = MAGIC_ITEM_TYPES.find((t) => t.id === p.类型)?.label ?? p.类型
              return (
                <Fragment key={p.id}>
                <tr className="border-t border-gray-700/80 hover:bg-gray-800/40">
                  <td className="py-1.5 px-2 text-dnd-text-body">{typeLabel}</td>
                  <td className="py-1.5 px-2 text-white font-medium">{p.物品名称 || '—'}</td>
                  <td className="py-1.5 px-1.5 text-right text-dnd-text-body tabular-nums" title="成本/1000">
                    {calcCraftingDays(p.消耗金额 ?? '')}
                  </td>
                  <td className="py-1.5 px-1.5 text-dnd-text-body">{p.消耗金额 || '—'}</td>
                  <td className="py-1.5 px-1.5 text-dnd-text-body">{p.材料费用 || '—'}</td>
                  <td className="py-1.5 px-1.5 text-right text-dnd-text-body">{p.消耗经验 ?? 0}</td>
                  <td className="py-1.5 px-1.5 text-dnd-text-body line-clamp-1" title={characters.find((c) => c.id === p.制作需求人)?.name || p.制作需求人}>{characters.find((c) => c.id === p.制作需求人)?.name || p.制作需求人 || '—'}</td>
                  <td className="py-1.5 px-1.5">
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => setDepositProjectIndex(i)} title="存入角色" className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/20">
                        <Package size={14} />
                      </button>
                      <button type="button" onClick={() => setExpandedIndex(isExpanded ? null : i)} title="编辑详情" className="p-1.5 rounded text-amber-400 hover:bg-amber-400/20">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1.5 rounded text-dnd-red hover:bg-dnd-red/20">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t-0 bg-gray-800/60">
                    <td colSpan={8} className="py-2 px-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">物品名称</label>
                          <input type="text" value={p.物品名称 ?? ''} onChange={(e) => handleUpdate(i, { 物品名称: e.target.value })} className={inputClass + ' h-8 w-full'} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">详细描述</label>
                          <textarea value={p.详细介绍 ?? ''} onChange={(e) => handleUpdate(i, { 详细介绍: e.target.value })} rows={2} className={textareaClass + ' w-full text-xs'} />
                        </div>
                        {p.类型 === 'potion' ? (
                          <>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">所含法术环级</label>
                              <input type="number" min={0} max={9} value={p.所含法术环级 ?? p.所含法术等级 ?? 1} onChange={(e) => { const sl = Math.max(0, Math.min(9, parseInt(e.target.value, 10) || 0)); const mp = calcPotionMarketPrice(sl); handleUpdate(i, { 所含法术环级: sl, 消耗金额: `${calcPotionCraftCost(mp)} GP`, 消耗经验: calcPotionXpCost(mp) }); }} className={inputClass + ' h-8 w-full'} />
                              <p className="text-dnd-text-muted text-[10px] mt-0.5">施法者等级={calcMinCasterLevel(p.所含法术环级 ?? p.所含法术等级 ?? 1)}（自动）</p>
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">材料费用</label>
                              <input type="text" value={p.材料费用 ?? ''} onChange={(e) => handleUpdate(i, { 材料费用: e.target.value })} placeholder="如：100 GP" className={inputClass + ' h-8 w-full'} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">交易价格</label>
                              <input type="text" value={`${calcPotionMarketPrice(p.所含法术环级 ?? p.所含法术等级 ?? 1)} GP`} readOnly className={inputClass + ' h-8 w-full ' + autoCalcClass} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">制作成本 / 消耗经验</label>
                              <span className="text-dnd-text-body text-xs">{p.消耗金额 || '—'} / {p.消耗经验 ?? 0} XP</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">消耗金额</label>
                              <input type="text" value={p.消耗金额 ?? ''} onChange={(e) => { const v = e.target.value; handleUpdate(i, { 消耗金额: v }); }} className={inputClass + ' h-8 w-full'} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">材料费用</label>
                              <input type="text" value={p.材料费用 ?? ''} onChange={(e) => handleUpdate(i, { 材料费用: e.target.value })} placeholder="如：100 GP" className={inputClass + ' h-8 w-full'} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">制作天数</label>
                              <input type="number" min={0} value={calcCraftingDays(p.消耗金额 ?? '')} readOnly className={inputClass + ' h-8 w-full ' + autoCalcClass} title="成本/1000" />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">消耗经验</label>
                              <input type="number" min={0} value={p.消耗经验 ?? 0} onChange={(e) => handleUpdate(i, { 消耗经验: parseInt(e.target.value, 10) || 0 })} className={inputClass + ' h-8 w-full'} />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">制作需求人</label>
                          <select value={p.制作需求人 ?? ''} onChange={(e) => handleUpdate(i, { 制作需求人: e.target.value })} className={inputClass + ' h-8 w-full'}>
                            <option value="">— 选择角色 —</option>
                            {characters.map((c) => (
                              <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 存入角色弹窗 */}
      {depositProjectIndex != null && projects[depositProjectIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDepositProjectIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="font-display font-semibold text-white">存入角色</h2>
              <p className="text-dnd-text-muted text-sm mt-1">{projects[depositProjectIndex].物品名称 || '未命名'}</p>
            </div>
            <div className="p-4">
              <label className="block text-dnd-text-muted text-xs mb-1">选择角色</label>
              <select
                value={depositCharId}
                onChange={(e) => setDepositCharId(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
              >
                <option value="">— 选择 —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
              <button type="button" onClick={() => setDepositProjectIndex(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">取消</button>
              <button type="button" onClick={confirmDeposit} disabled={!depositCharId} className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
