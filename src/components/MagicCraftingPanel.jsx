/**
 * 魔法物品制作工厂：D&D 3R 奥法工坊规则
 * 选择类型、填写物品信息、推进制作进度，完成后可存入仓库或角色
 */
import { useState, useEffect, useMemo, Fragment } from 'react'
import { Package, Pencil, Trash2, GripVertical, Hammer, Plus } from 'lucide-react'
import {
  getCraftingProjects,
  addCraftingProject,
  updateCraftingProject,
  removeCraftingProject,
  reorderCraftingProjects,
  MAGIC_ITEM_TYPES,
} from '../lib/craftingStore'
import { normalizeProject, isCraftFeeClaimed, DND_CRAFT_COMPLETED_MIME } from '../lib/craftingProjectUtils'
import {
  parseCostFromString,
  calcCraftingDays,
  calcMinCasterLevel,
  calcPotionMarketPrice,
  calcPotionCraftCost,
  calcPotionXpCost,
  calcScrollMarketPrice,
  calcWandMarketPrice,
  calcStaffMarketPrice,
  calcXpFromCraftCostGp,
} from '../lib/craftingFormulas'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { logTeamActivity } from '../lib/activityLog'
import { getAllCharacters, getCharacter, updateCharacter } from '../lib/characterStore'
import { CRAFTING_FEAT_IDS } from '../data/feats'
import { loadTeamVaultIntoCache, getCharacterWallet } from '../lib/currencyStore'
import { getEffectiveTeamVaultBalances, deductTeamCurrency } from '../lib/teamCurrencyPublicBags'
import { loadCraftingIntoCache } from '../lib/craftingStore'
import { isSupabaseEnabled } from '../lib/supabase'
import { addToWarehouse } from '../lib/warehouseStore'
import { inputClass, textareaClass } from '../lib/inputStyles'

/** 自动计算字段：无描边 */
const autoCalcClass = 'border-0 bg-gray-700/50 cursor-default'

/** 判断角色是否为器魂术士（主职、兼职或进阶） */
function isArtificer(char) {
  if (!char) return false
  const main = char['class'] ?? char.class ?? ''
  if (main === '器魂术士') return true
  const multi = Array.isArray(char.multiclass) ? char.multiclass : []
  if (multi.some((m) => (m['class'] ?? m.class ?? '') === '器魂术士')) return true
  const prestige = Array.isArray(char.prestige) ? char.prestige : []
  if (prestige.some((p) => (p['class'] ?? p.class ?? '') === '器魂术士')) return true
  return false
}

/** 判断角色是否拥有制作物品专长 */
function hasCraftingFeat(char) {
  if (!char) return false
  const feats = Array.isArray(char.selectedFeats) ? char.selectedFeats : []
  return feats.some((f) => CRAFTING_FEAT_IDS.includes(f.featId))
}

/** 可担任工匠的角色：器魂术士 或 拥有制作物品专长 */
function getEligibleCrafters(characters) {
  return characters.filter((c) => isArtificer(c) || hasCraftingFeat(c))
}

/** 非 DM：仅能看到委托角色为自己所建角色的完成项；无委托角色时旧数据仍显示 */
function canSeeCompletedRow(p, admin, ownerName) {
  if (admin) return true
  if (!ownerName) return true
  const del = (p.委托角色 ?? '').trim()
  if (!del) return true
  const ch = getCharacter(del)
  return ch?.owner === ownerName
}

function formatCompleteTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

export default function MagicCraftingPanel() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const [projects, setProjects] = useState([])
  const [expandedIndex, setExpandedIndex] = useState(null)
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [isDragOverCraftZone, setIsDragOverCraftZone] = useState(false)
  const [craftZoneCrafterId, setCraftZoneCrafterId] = useState('')
  // 新建表单
  const [new类型, setNew类型] = useState(MAGIC_ITEM_TYPES[0].id)
  const [new物品名称, setNew物品名称] = useState('')
  const [new详细介绍, setNew详细介绍] = useState('')
  const [new消耗金额, setNew消耗金额] = useState('')
  const [new材料费用, setNew材料费用] = useState('')
  const [new消耗经验, setNew消耗经验] = useState(0)
  const [new制作需求人, setNew制作需求人] = useState('')
  const [new委托角色, setNew委托角色] = useState('')
  const [new所含法术环级, setNew所含法术环级] = useState(1)
  const [new充能次数, setNew充能次数] = useState(50)
  const [new单次材料费, setNew单次材料费] = useState(0)
  const [new法术数量, setNew法术数量] = useState(1)
  const [new数量, setNew数量] = useState(1)
  const [showNewCraftModal, setShowNewCraftModal] = useState(false)
  // 存入
  const [depositProjectIndex, setDepositProjectIndex] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositToWarehouse, setDepositToWarehouse] = useState(true)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [vault, setVault] = useState({})
  /** 领取结算：公费 team vault gp / 个人某角色钱包 gp */
  const [claimProjectIndex, setClaimProjectIndex] = useState(null)
  const [claimCostSource, setClaimCostSource] = useState('vault')
  const [claimPayerCharId, setClaimPayerCharId] = useState('')
  const [isClaiming, setIsClaiming] = useState(false)

  const characters = getAllCharacters(currentModuleId)
  const eligibleCrafters = getEligibleCrafters(characters)
  const userName = user?.name?.trim() || ''

  /** 新建时可选委托角色：DM 可见全部；玩家仅自己创建的角色 */
  const delegateCharacterOptions = useMemo(() => {
    if (isAdmin) return characters
    if (!userName) return []
    return characters.filter((c) => c.owner === userName)
  }, [characters, isAdmin, userName])

  const refresh = () => setProjects(getCraftingProjects(currentModuleId))
  const refreshVault = () => setVault(getEffectiveTeamVaultBalances(currentModuleId))

  useEffect(() => {
    const onCraft = () => refresh()
    const onVault = () => refreshVault()
    window.addEventListener('dnd-realtime-crafting', onCraft)
    window.addEventListener('dnd-realtime-team-vault', onVault)
    window.addEventListener('dnd-realtime-characters', onVault)
    return () => {
      window.removeEventListener('dnd-realtime-crafting', onCraft)
      window.removeEventListener('dnd-realtime-team-vault', onVault)
      window.removeEventListener('dnd-realtime-characters', onVault)
    }
  }, [currentModuleId])

  useEffect(() => {
    if (isSupabaseEnabled()) {
      Promise.all([loadCraftingIntoCache(currentModuleId), loadTeamVaultIntoCache(currentModuleId)]).then(() =>
        {
          refresh()
          refreshVault()
        }
      )
    } else {
      refresh()
      refreshVault()
    }
  }, [currentModuleId])

  const computeNewProjectStats = () => {
    const type = new类型
    let costGp = 0
    let xp = 0
    if (type === 'potion') {
      const mp = calcPotionMarketPrice(new所含法术环级)
      costGp = calcPotionCraftCost(mp)
      xp = calcPotionXpCost(mp)
    } else if (type === 'scroll') {
      const mp = calcScrollMarketPrice(new所含法术环级, new数量)
      costGp = Math.floor(mp / 2)
      xp = calcXpFromCraftCostGp(costGp)
    } else if (type === 'wand') {
      const mp = calcWandMarketPrice(new所含法术环级, new单次材料费, new充能次数)
      costGp = Math.floor(mp / 2)
      xp = calcXpFromCraftCostGp(costGp)
    } else if (type === 'staff') {
      const mp = calcStaffMarketPrice(new所含法术环级, new法术数量, new单次材料费, new充能次数)
      costGp = Math.floor(mp / 2)
      xp = calcXpFromCraftCostGp(costGp)
    } else if (type === 'weapon_armor') {
      const market = parseCostFromString(new消耗金额)
      costGp = Math.floor(market / 2)
      xp = calcXpFromCraftCostGp(costGp)
    } else {
      const market = parseCostFromString(new消耗金额)
      costGp = Math.floor(market / 2)
      xp = new消耗经验 > 0 ? new消耗经验 : calcXpFromCraftCostGp(costGp)
    }
    const days = calcCraftingDays(String(costGp))
    return { costStr: `${costGp} GP`, xp, days }
  }

  const handleAdd = () => {
    const name = new物品名称?.trim()
    if (!name) return
    const { costStr, xp, days } = computeNewProjectStats()
    Promise.resolve(
      addCraftingProject(currentModuleId, {
        类型: new类型,
        物品名称: name,
        详细介绍: new详细介绍,
        制作天数: days,
        消耗金额: costStr,
        ...(new类型 !== 'weapon_armor' ? { 材料费用: new材料费用 } : {}),
        消耗经验: xp,
        制作需求人: new制作需求人,
        委托角色: new委托角色,
        ...(['potion', 'scroll', 'wand', 'staff'].includes(new类型) ? { 所含法术环级: new所含法术环级 } : {}),
        ...(['wand', 'staff'].includes(new类型) ? { 充能次数: new充能次数, 单次材料费: new单次材料费 } : {}),
        ...(new类型 === 'staff' ? { 法术数量: new法术数量 } : {}),
        ...(new类型 === 'scroll' ? { 数量: new数量 } : {}),
      })
    ).then(() => {
      refresh()
      setNew物品名称('')
      setNew详细介绍('')
      setNew消耗金额('')
      setNew材料费用('')
      setNew消耗经验(0)
      setNew制作需求人('')
      setNew委托角色('')
      setNew所含法术环级(1)
      setNew充能次数(50)
      setNew单次材料费(0)
      setNew法术数量(1)
      setNew数量(1)
      setShowNewCraftModal(false)
    })
  }

  const handleUpdate = (index, patch) => {
    Promise.resolve(updateCraftingProject(currentModuleId, index, patch)).then(refresh)
  }

  const handleRemove = (index) => {
    Promise.resolve(removeCraftingProject(currentModuleId, index)).then(() => {
      refresh()
    if (expandedIndex === index) setExpandedIndex(null)
    else if (expandedIndex != null && expandedIndex > index) setExpandedIndex(expandedIndex - 1)
    if (selectedProjectIndex === index) setSelectedProjectIndex(null)
    else if (selectedProjectIndex != null && selectedProjectIndex > index) setSelectedProjectIndex(selectedProjectIndex - 1)
    })
  }

  const handleAdvanceDay = () => {
    if (selectedProjectIndex == null || isAdvancing) return
    const p = projects[selectedProjectIndex]
    const norm = normalizeProject(p)
    if (norm.状态 === 'COMPLETED') return
    const daysTotal = norm.制作天数 || 1
    const daysDone = norm.已制作天数 ?? 0
    const crafterId = (craftZoneCrafterId || p.制作需求人 || '').trim()
    const prevProjects = projects
    const nextDone = daysDone + 1
    const isComplete = nextDone >= daysTotal
    const nowIso = new Date().toISOString()

    const patch = {
      已制作天数: nextDone,
      状态: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
      ...(isComplete
        ? {
            完成时间: nowIso,
            实际制作者: crafterId,
            已领取: false,
          }
        : {}),
    }

    setIsAdvancing(true)
    setProjects((prev) =>
      prev.map((proj, idx) => (idx === selectedProjectIndex ? { ...proj, ...patch } : proj)),
    )
    if (isComplete) setSelectedProjectIndex(null)

    Promise.resolve(updateCraftingProject(currentModuleId, selectedProjectIndex, patch))
      .then(() => {
        refresh()
      })
      .catch((err) => {
        console.error('[Crafting] 推进制作失败', err)
        setProjects(prevProjects)
        setSelectedProjectIndex(selectedProjectIndex)
        if (isSupabaseEnabled()) {
          loadCraftingIntoCache(currentModuleId).then(refresh)
        } else {
          refresh()
        }
        alert(err?.message || '推进失败，请重试')
      })
      .finally(() => {
        setIsAdvancing(false)
      })
  }

  const openClaimModal = (index) => {
    const p = projects[index]
    if (!p || isCraftFeeClaimed(p)) return
    setClaimProjectIndex(index)
    setClaimCostSource('vault')
    const payers = delegateCharacterOptions.filter((c) => {
      const gp = getCharacterWallet(c.id).gp ?? 0
      return gp >= parseCostFromString(p.消耗金额)
    })
    setClaimPayerCharId(payers[0]?.id ?? delegateCharacterOptions[0]?.id ?? '')
  }

  const handleConfirmClaim = () => {
    if (claimProjectIndex == null || isClaiming) return
    const p = projects[claimProjectIndex]
    if (!p || isCraftFeeClaimed(p)) {
      setClaimProjectIndex(null)
      return
    }
    const costGp = parseCostFromString(p.消耗金额)
    const totalXp = Math.max(0, Number(p.消耗经验) || 0)
    const makerId = (p.实际制作者 || p.制作需求人 || '').trim()
    const maker = makerId ? getCharacter(makerId) : null

    if (totalXp > 0 && !makerId) {
      alert('未记录实际制作者，无法扣除经验。请由 DM 在存档中补全「实际制作者」或重新制作。')
      return
    }
    if (totalXp > 0 && maker && (Number(maker.xp) || 0) < totalXp) {
      alert(`工匠「${maker.name || '未命名'}」经验不足：需要 ${totalXp} XP，当前 ${Math.round(Number(maker.xp) || 0)} XP`)
      return
    }

    if (claimCostSource === 'vault') {
      const effGp = vault.gp ?? 0
      if (effGp < costGp) {
        alert(`团队金库金币不足（含公家次元袋）：需要 ${Math.ceil(costGp)} GP，当前约 ${Math.round(effGp)} GP`)
        return
      }
    } else {
      if (!claimPayerCharId) {
        alert('请选择支付金币的角色')
        return
      }
      const w = getCharacterWallet(claimPayerCharId)
      if ((w.gp ?? 0) < costGp) {
        alert(`该角色个人金币不足：需要 ${Math.ceil(costGp)} GP，当前 ${Math.round(w.gp ?? 0)} GP`)
        return
      }
    }

    const name = p.物品名称?.trim() || '未命名物品'
    setIsClaiming(true)
    const prevVault = vault
    const idx = claimProjectIndex

    const runVault = () =>
      Promise.resolve(deductTeamCurrency(currentModuleId, 'gp', Math.ceil(costGp))).then((r) => {
        if (!r.success) throw new Error(r.error || '扣除团队资金失败')
      })

    const runPersonal = () => {
      const w = getCharacterWallet(claimPayerCharId)
      const nextGp = Math.max(0, (w.gp ?? 0) - costGp)
      return Promise.resolve(updateCharacter(claimPayerCharId, { wallet: { ...w, gp: nextGp } }))
    }

    const runXp = () => {
      if (totalXp <= 0 || !makerId) return Promise.resolve()
      const m = getCharacter(makerId)
      const xpNow = Number(m?.xp) || 0
      return Promise.resolve(updateCharacter(makerId, { xp: Math.max(0, xpNow - totalXp) }))
    }

    const payPromise = claimCostSource === 'vault' ? runVault() : runPersonal()

    payPromise
      .then(() => runXp())
      .then(() => updateCraftingProject(currentModuleId, idx, { 已领取: true }))
      .then(() => {
        if (user?.name) {
          const src = claimCostSource === 'vault' ? '团队金库' : `角色「${getCharacter(claimPayerCharId)?.name || '未命名'}」个人金币`
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 领取制作完成「${name}」：支付 ${Math.ceil(costGp)} GP（${src}）、工匠扣除 ${totalXp} XP`,
          })
        }
        setClaimProjectIndex(null)
        setVault(getEffectiveTeamVaultBalances(currentModuleId))
        refresh()
        refreshVault()
        window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
      })
      .catch((err) => {
        console.error('[Crafting] 领取结算失败', err)
        setVault(prevVault)
        alert(err?.message || '领取失败，请重试')
        if (isSupabaseEnabled()) {
          loadTeamVaultIntoCache(currentModuleId).then(() => {
            refreshVault()
            refresh()
          })
        }
      })
      .finally(() => setIsClaiming(false))
  }

  const handleAbandon = (index) => {
    if (!confirm('确定要放弃这个制作项目吗？')) return
    handleRemove(index)
  }

  const handleReorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    Promise.resolve(reorderCraftingProjects(currentModuleId, fromIndex, toIndex)).then(() => {
      refresh()
      if (selectedProjectIndex === fromIndex) setSelectedProjectIndex(toIndex)
      else if (selectedProjectIndex === toIndex) setSelectedProjectIndex(fromIndex)
      else if (selectedProjectIndex != null) {
        let s = selectedProjectIndex
        if (s > fromIndex && s <= toIndex) s--
        else if (s >= toIndex && s < fromIndex) s++
        setSelectedProjectIndex(s)
      }
    })
  }

  const confirmDeposit = () => {
    if (depositProjectIndex == null) return
    const p = projects[depositProjectIndex]
    if (!p) {
      setDepositProjectIndex(null)
      return
    }
    if (!isCraftFeeClaimed(p)) {
      alert('请先在下方「已完成物品列表」中点击「领取结算」，支付制作成本与经验后，再存入物品。')
      return
    }
    const name = p.物品名称?.trim() || '未命名魔法物品'
    const desc = p.详细介绍?.trim() ?? ''
    const finishDeposit = () =>
      Promise.resolve(removeCraftingProject(currentModuleId, depositProjectIndex)).then(() => {
        refresh()
        setDepositProjectIndex(null)
        setDepositCharId('')
      })

    if (depositToWarehouse) {
      Promise.resolve(addToWarehouse(currentModuleId, { name, 详细介绍: desc, qty: 1 })).then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将制作的「${name}」放入团队仓库`,
          })
        }
        return finishDeposit()
      })
    } else {
      if (!depositCharId) return
      const char = characters.find((c) => c.id === depositCharId)
      if (!char) {
        setDepositProjectIndex(null)
        return
      }
      const inv = char.inventory ?? []
      Promise.resolve(
        updateCharacter(depositCharId, {
          inventory: [...inv, { id: 'inv_' + Date.now(), name, 详细介绍: desc, qty: 1 }],
        })
      ).then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将制作的「${name}」存入了角色「${char.name || '未命名'}」的背包`,
          })
        }
        return finishDeposit()
      })
    }
  }

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-5 space-y-5">
      <h2 className="text-dnd-gold-light text-base font-bold uppercase tracking-wider">魔法物品制作工厂</h2>

      {/* 新建制作：按钮 + 弹窗 */}
      <button type="button" onClick={() => setShowNewCraftModal(true)} className="w-full h-12 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-base flex items-center justify-center gap-2">
        <Plus size={20} /> 新建制作
      </button>

      {showNewCraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto" onClick={() => setShowNewCraftModal(false)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto my-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 px-4 py-3 border-b border-white/10 bg-dnd-card flex items-center justify-between">
              <h3 className="font-display font-semibold text-white">新建魔法物品</h3>
              <button type="button" onClick={() => setShowNewCraftModal(false)} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600">×</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-dnd-text-muted text-xs">一名工匠每天只推进一件。推进<strong className="text-dnd-text-body">不会</strong>立即扣金库或经验；制作<strong className="text-dnd-text-body">完成</strong>后出现在下方列表，<strong className="text-dnd-text-body">领取结算</strong>时再扣成本与经验，之后才可存入仓库/角色。</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-dnd-text-muted text-xs mb-1">魔法物品类型</label>
                  <select value={new类型} onChange={(e) => setNew类型(e.target.value)} className={inputClass + ' w-full h-9'}>
                    {MAGIC_ITEM_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}{t.maxSl ? ` [限${t.maxSl}环]` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-dnd-text-muted text-xs mb-1">物品名称 <span className="text-dnd-red">*</span></label>
                  <input type="text" value={new物品名称} onChange={(e) => setNew物品名称(e.target.value)} placeholder="如：火焰球魔杖（必填）" className={inputClass + ' w-full h-9'} />
                </div>
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">详细描述（可选）</label>
                <textarea value={new详细介绍} onChange={(e) => setNew详细介绍(e.target.value)} placeholder="效果、说明等" rows={2} className={textareaClass + ' w-full'} />
              </div>
              {new类型 === 'potion' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className="block text-dnd-text-muted text-xs mb-1">所含法术环级</label><input type="number" min={1} max={4} value={new所含法术环级} onChange={(e) => setNew所含法术环级(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))} className={inputClass + ' h-9 w-16'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">施法者等级</label><input type="text" value={calcMinCasterLevel(new所含法术环级) + '（自动）'} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">材料费用</label><input type="text" value={new材料费用} onChange={(e) => setNew材料费用(e.target.value)} placeholder="如：100 GP" className={inputClass + ' h-9 w-24'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">交易价格</label><input type="text" value={`${calcPotionMarketPrice(new所含法术环级)} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作成本</label><input type="text" value={`${calcPotionCraftCost(calcPotionMarketPrice(new所含法术环级))} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作天数</label><input type="text" value={calcCraftingDays(String(calcPotionCraftCost(calcPotionMarketPrice(new所含法术环级))))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label><input type="text" value={calcPotionXpCost(calcPotionMarketPrice(new所含法术环级))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                </div>
              )}
              {(new类型 === 'wand' || new类型 === 'staff') && (
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className="block text-dnd-text-muted text-xs mb-1">所含法术环级</label><input type="number" min={1} max={new类型 === 'wand' ? 4 : 9} value={new所含法术环级} onChange={(e) => setNew所含法术环级(Math.max(1, Math.min(new类型 === 'wand' ? 4 : 9, parseInt(e.target.value, 10) || 1)))} className={inputClass + ' h-9 w-16'} /></div>
                  {new类型 === 'staff' && <div><label className="block text-dnd-text-muted text-xs mb-1">法术数量</label><input type="number" min={1} value={new法术数量} onChange={(e) => setNew法术数量(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-9 w-16'} /></div>}
                  <div><label className="block text-dnd-text-muted text-xs mb-1">单次材料费(gp)</label><input type="number" min={0} value={new单次材料费} onChange={(e) => setNew单次材料费(parseFloat(e.target.value) || 0)} className={inputClass + ' h-9 w-20'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">充能次数</label><select value={new充能次数} onChange={(e) => setNew充能次数(parseInt(e.target.value, 10))} className={inputClass + ' h-9 w-24'}><option value={50}>50 发 (100%)</option><option value={40}>40 发 (80%)</option><option value={30}>30 发 (60%)</option><option value={20}>20 发 (40%)</option><option value={10}>10 发 (20%)</option></select></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">交易价格</label><input type="text" value={`${new类型 === 'wand' ? calcWandMarketPrice(new所含法术环级, new单次材料费, new充能次数) : calcStaffMarketPrice(new所含法术环级, new法术数量, new单次材料费, new充能次数)} GP`} readOnly className={inputClass + ' h-9 w-24 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作成本</label><input type="text" value={`${Math.floor((new类型 === 'wand' ? calcWandMarketPrice(new所含法术环级, new单次材料费, new充能次数) : calcStaffMarketPrice(new所含法术环级, new法术数量, new单次材料费, new充能次数)) / 2)} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作天数</label><input type="text" value={calcCraftingDays(String(Math.floor((new类型 === 'wand' ? calcWandMarketPrice(new所含法术环级, new单次材料费, new充能次数) : calcStaffMarketPrice(new所含法术环级, new法术数量, new单次材料费, new充能次数)) / 2)))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label><input type="text" value={calcXpFromCraftCostGp(Math.floor((new类型 === 'wand' ? calcWandMarketPrice(new所含法术环级, new单次材料费, new充能次数) : calcStaffMarketPrice(new所含法术环级, new法术数量, new单次材料费, new充能次数)) / 2))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                </div>
              )}
              {new类型 === 'scroll' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className="block text-dnd-text-muted text-xs mb-1">所含法术环级</label><input type="number" min={1} max={9} value={new所含法术环级} onChange={(e) => setNew所含法术环级(Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)))} className={inputClass + ' h-9 w-16'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">数量</label><input type="number" min={1} value={new数量} onChange={(e) => setNew数量(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-9 w-14'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">交易价格</label><input type="text" value={`${calcScrollMarketPrice(new所含法术环级, new数量)} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作成本</label><input type="text" value={`${Math.floor(calcScrollMarketPrice(new所含法术环级, new数量) / 2)} GP`} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作天数</label><input type="text" value={calcCraftingDays(String(Math.floor(calcScrollMarketPrice(new所含法术环级, new数量) / 2)))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label><input type="text" value={calcXpFromCraftCostGp(Math.floor(calcScrollMarketPrice(new所含法术环级, new数量) / 2))} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                </div>
              )}
              {new类型 === 'weapon_armor' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className="block text-dnd-text-muted text-xs mb-1">成交价格(gp)</label><input type="text" value={new消耗金额} onChange={(e) => setNew消耗金额(e.target.value)} placeholder="如：500 GP" className={inputClass + ' h-9 w-24'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作成本</label><input type="text" value={new消耗金额 ? `${Math.floor(parseCostFromString(new消耗金额) / 2)} GP` : '0 GP'} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作天数</label><input type="text" value={new消耗金额 ? calcCraftingDays(new消耗金额) : 0} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label><input type="text" value={new消耗金额 ? calcXpFromCraftCostGp(Math.floor(parseCostFromString(new消耗金额) / 2)) : 0} readOnly className={inputClass + ' h-9 w-16 ' + autoCalcClass} /></div>
                </div>
              )}
              {['rod', 'wondrous', 'ring'].includes(new类型) && (
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className="block text-dnd-text-muted text-xs mb-1">交易价格(gp)</label><input type="text" value={new消耗金额} onChange={(e) => setNew消耗金额(e.target.value)} placeholder="如：500 GP" className={inputClass + ' h-9 w-24'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">材料费用</label><input type="text" value={new材料费用} onChange={(e) => setNew材料费用(e.target.value)} placeholder="如：100 GP" className={inputClass + ' h-9 w-24'} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作成本</label><input type="text" value={new消耗金额 ? `${Math.floor(parseCostFromString(new消耗金额) / 2)} GP` : '0 GP'} readOnly className={inputClass + ' h-9 w-20 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">制作天数</label><input type="text" value={new消耗金额 ? calcCraftingDays(new消耗金额) : 0} readOnly className={inputClass + ' h-9 w-14 ' + autoCalcClass} /></div>
                  <div><label className="block text-dnd-text-muted text-xs mb-1">消耗经验</label><input type="number" min={0} value={new消耗经验} onChange={(e) => setNew消耗经验(parseInt(e.target.value, 10) || 0)} className={inputClass + ' h-9 w-16'} /></div>
                </div>
              )}
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">委托角色（谁的需求）</label>
                <select value={new委托角色} onChange={(e) => setNew委托角色(e.target.value)} className={inputClass + ' h-9 w-full'}>
                  <option value="">— 可选 —</option>
                  {delegateCharacterOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
                <p className="text-dnd-text-muted text-[10px] mt-0.5">DM 可见全部角色；其他玩家仅可选自己创建的角色。完成后非 DM 仅能看到委托属于自己的条目。</p>
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">预定工匠（器魂术士或制作专长）</label>
                <select value={new制作需求人} onChange={(e) => setNew制作需求人(e.target.value)} className={inputClass + ' h-9 w-full'}>
                  <option value="">— 选择角色 —</option>
                  {eligibleCrafters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
                {eligibleCrafters.length === 0 && <p className="text-dnd-text-muted text-[10px] mt-0.5">推进时可在「制作中」区另选当前工匠；完成时记录为实际制作者。</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
              {!new物品名称?.trim() && <p className="text-dnd-red text-xs mr-auto self-center">请填写物品名称</p>}
              <button type="button" onClick={() => setShowNewCraftModal(false)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">取消</button>
              <button type="button" onClick={handleAdd} disabled={!new物品名称?.trim()} className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                加入制作队列
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 制作中：拖入项目开始制作 */}
      {projects.some((p) => normalizeProject(p).状态 === 'IN_PROGRESS') && (
        <div
          className={`rounded-lg border-2 border-dashed p-4 transition-colors ${isDragOverCraftZone ? 'border-emerald-500 bg-emerald-900/20' : 'border-gray-600 bg-gray-800/50'}`}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOverCraftZone(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOverCraftZone(false); }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOverCraftZone(false)
            const idx = parseInt(e.dataTransfer.getData('craft-index'), 10)
            if (Number.isNaN(idx) || idx < 0 || idx >= projects.length) return
            const p = normalizeProject(projects[idx])
            if (p.状态 === 'COMPLETED') return
            setSelectedProjectIndex(idx)
          }}
        >
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">制作中</h3>
            <div className="flex items-center gap-2">
              <label className="text-dnd-text-muted text-xs whitespace-nowrap">当前工匠</label>
              <select value={craftZoneCrafterId} onChange={(e) => setCraftZoneCrafterId(e.target.value)} className={inputClass + ' h-9 min-w-[8rem]'}>
                <option value="">— 选择角色 —</option>
                {eligibleCrafters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                ))}
              </select>
              {eligibleCrafters.length === 0 && <span className="text-dnd-text-muted text-[10px]">仅器魂术士或拥有制作专长的角色可选</span>}
            </div>
          </div>
          <p className="text-dnd-text-muted text-xs mb-3">拖入项目后选择<strong className="text-dnd-text-body">当前工匠</strong>并推进天数；本操作<strong className="text-dnd-text-body">不扣</strong>金库与经验。最后一格完成时会记录实际制作者。</p>
          {selectedProjectIndex != null && projects[selectedProjectIndex] && (() => {
            const p = normalizeProject(projects[selectedProjectIndex])
            if (p.状态 === 'COMPLETED') return null
            return (
              <div className="space-y-1">
                <button type="button" onClick={handleAdvanceDay} disabled={isAdvancing} className="w-full h-14 rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600/30 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/40 hover:border-emerald-400 disabled:bg-gray-700/50 disabled:border-gray-600 disabled:text-gray-500">
                  <Hammer size={18} /> {isAdvancing ? '保存中...' : `推进 1 天：${p.物品名称 || '未命名'}（完成后在下方领取时结算）`}
                </button>
              </div>
            )
          })()}
          {selectedProjectIndex == null && (
            <p className="text-dnd-text-muted text-sm py-2">将项目拖入此处开始制作</p>
          )}
        </div>
      )}

      {/* 制作列表 */}
      <div className="rounded border border-gray-600 overflow-hidden">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-gray-800/80 text-dnd-text-muted text-sm uppercase tracking-wider whitespace-nowrap">
              <th className="text-left py-2 px-2 w-9" title="拖拽排序" />
              <th className="text-left py-2 px-3 w-20">类型</th>
              <th className="text-left py-2 px-3">物品名称</th>
              <th className="text-left py-2 px-3 w-32">进度</th>
              <th className="text-left py-2 px-3 w-24">消耗金额</th>
              <th className="text-left py-2 px-3 w-20">材料费用</th>
              <th className="text-right py-2 px-3 w-14">经验</th>
              <th className="text-left py-2 px-3 min-w-[5rem]">委托</th>
              <th className="text-left py-2 px-3 min-w-[5rem]">预定工匠</th>
              <th className="text-right py-2 px-2 w-28" />
            </tr>
          </thead>
          <tbody>
            {projects.filter((p) => normalizeProject(p).状态 !== 'COMPLETED').length === 0 && (
              <tr>
                <td colSpan={10} className="py-4 text-center text-dnd-text-muted">暂无进行中的制作，请在上方添加或从下方查看已完成项</td>
              </tr>
            )}
            {projects.map((p, i) => {
              const isExpanded = expandedIndex === i
              const norm = normalizeProject(p)
              if (norm.状态 === 'COMPLETED') return null
              const isSelected = selectedProjectIndex === i
              const typeLabel = MAGIC_ITEM_TYPES.find((t) => t.id === p.类型)?.label ?? p.类型
              const progressPct = (norm.制作天数 || 0) > 0 ? Math.round((norm.已制作天数 ?? 0) / norm.制作天数 * 100) : 0
              return (
                <Fragment key={p.id}>
                <tr
                  className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${isSelected ? 'bg-emerald-900/20 border-l-2 border-l-emerald-500' : ''} ${dragIndex === i ? 'opacity-50' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragIndex(i); e.dataTransfer.setData('craft-index', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => setDragIndex(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex != null && dragIndex !== i) handleReorder(dragIndex, i); setDragIndex(null); }}
                >
                  <td className="py-2 px-2 text-gray-500 align-middle" title="拖拽调整顺序">
                    <GripVertical className="w-4 h-4 cursor-grab" />
                  </td>
                  <td className="py-2 px-3 text-dnd-text-body align-middle">{typeLabel}</td>
                  <td className="py-2 px-3 text-white font-medium align-middle" title={p.物品名称 || '—'}>{p.物品名称 || '—'}</td>
                  <td className="py-2 px-3 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[4rem]">
                        <div className="h-2.5 rounded-full bg-gray-700 overflow-hidden">
                          <div className="h-full rounded-full transition-all bg-amber-500" style={{ width: `${progressPct}%` }} />
                        </div>
                        <span className="text-xs text-dnd-text-muted">{norm.已制作天数 ?? 0}/{norm.制作天数} 天</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-dnd-text-body align-middle tabular-nums">{p.消耗金额 || '—'}</td>
                  <td className="py-2 px-3 text-dnd-text-body align-middle">{p.材料费用 || '—'}</td>
                  <td className="py-2 px-3 text-right text-dnd-text-body align-middle tabular-nums">{p.消耗经验 ?? 0}</td>
                  <td className="py-2 px-3 text-dnd-text-body align-middle text-xs" title={characters.find((c) => c.id === (p.委托角色 || ''))?.name}>{characters.find((c) => c.id === (p.委托角色 || ''))?.name || (p.委托角色 ? '—' : '—')}</td>
                  <td className="py-2 px-3 text-dnd-text-body align-middle" title={characters.find((c) => c.id === p.制作需求人)?.name || p.制作需求人}>{characters.find((c) => c.id === p.制作需求人)?.name || p.制作需求人 || '—'}</td>
                  <td className="py-2 px-2 align-middle text-right">
                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <button type="button" onClick={() => setExpandedIndex(isExpanded ? null : i)} title="编辑详情" className="p-2 rounded text-amber-400 hover:bg-amber-400/20">
                        <Pencil size={16} />
                      </button>
                      <button type="button" onClick={() => handleAbandon(i)} title="放弃项目" className="p-2 rounded text-dnd-red hover:bg-dnd-red/20">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t-0 bg-gray-800/60">
                    <td colSpan={10} className="py-2 px-3">
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
                            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">委托角色（需求方）</label>
                                <select value={p.委托角色 ?? ''} onChange={(e) => handleUpdate(i, { 委托角色: e.target.value })} className={inputClass + ' h-8 w-full'}>
                                  <option value="">— 可选 —</option>
                                  {delegateCharacterOptions.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">预定工匠</label>
                                <select value={p.制作需求人 ?? ''} onChange={(e) => handleUpdate(i, { 制作需求人: e.target.value })} className={inputClass + ' h-8 w-full'}>
                                  <option value="">— 选择角色 —</option>
                                  {eligibleCrafters.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">{p.类型 === 'weapon_armor' ? '成交价格' : '消耗金额'}</label>
                              <input type="text" value={p.消耗金额 ?? ''} onChange={(e) => { const v = e.target.value; handleUpdate(i, p.类型 === 'weapon_armor' ? { 消耗金额: v, 消耗经验: calcXpFromCraftCostGp(parseCostFromString(v)) } : { 消耗金额: v }); }} className={inputClass + ' h-8 w-full'} />
                            </div>
                            {p.类型 !== 'weapon_armor' && (
                              <div>
                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">材料费用</label>
                                <input type="text" value={p.材料费用 ?? ''} onChange={(e) => handleUpdate(i, { 材料费用: e.target.value })} placeholder="如：100 GP" className={inputClass + ' h-8 w-full'} />
                              </div>
                            )}
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">制作天数</label>
                              <input type="number" min={0} value={calcCraftingDays(p.消耗金额 ?? '')} readOnly className={inputClass + ' h-8 w-full ' + autoCalcClass} title="成本/1000" />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">消耗经验</label>
                              {p.类型 === 'weapon_armor'
                                ? <input type="text" value={calcXpFromCraftCostGp(parseCostFromString(p.消耗金额 ?? ''))} readOnly className={inputClass + ' h-8 w-full ' + autoCalcClass} />
                                : <input type="number" min={0} value={p.消耗经验 ?? 0} onChange={(e) => handleUpdate(i, { 消耗经验: parseInt(e.target.value, 10) || 0 })} className={inputClass + ' h-8 w-full'} />
                              }
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">委托角色（需求方）</label>
                          <select value={p.委托角色 ?? ''} onChange={(e) => handleUpdate(i, { 委托角色: e.target.value })} className={inputClass + ' h-8 w-full'}>
                            <option value="">— 可选 —</option>
                            {delegateCharacterOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">预定工匠</label>
                          <select value={p.制作需求人 ?? ''} onChange={(e) => handleUpdate(i, { 制作需求人: e.target.value })} className={inputClass + ' h-8 w-full'}>
                            <option value="">— 选择角色 —</option>
                            {eligibleCrafters.map((c) => (
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

      {/* 已完成：领取结算后再可存入 */}
      <div className="rounded-xl border border-dnd-gold/35 bg-[#151c28]/40 overflow-hidden mt-6">
        <div className="px-3 py-2 border-b border-white/10 bg-[#1b2738]/60">
          <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">已完成物品列表</h3>
          <p className="text-dnd-text-muted text-[10px] mt-1 leading-relaxed">
            显示完成时间、委托角色、实际制作者。非 DM 仅能看到<strong className="text-dnd-text-body">委托角色为自己所建角色</strong>的条目（未填委托的旧数据全员可见）。请先<strong className="text-dnd-text-body">领取结算</strong>（扣制作成本与工匠经验，成本可选团队金库或个人金币），再<strong className="text-dnd-text-body">拖入上方「公家次元袋」</strong>或使用包裹按钮存入仓库/角色背包。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider whitespace-nowrap border-b border-white/10">
                <th className="text-center py-2 px-2 w-9" title="拖入仓库页公家次元袋">拖</th>
                <th className="text-left py-2 px-3">完成时间</th>
                <th className="text-left py-2 px-3">物品</th>
                <th className="text-left py-2 px-3 w-24">类型</th>
                <th className="text-left py-2 px-3">委托（需求）</th>
                <th className="text-left py-2 px-3">实际制作者</th>
                <th className="text-right py-2 px-3">成本(GP)</th>
                <th className="text-right py-2 px-3">经验(XP)</th>
                <th className="text-left py-2 px-3">状态</th>
                <th className="text-right py-2 px-2 w-36">操作</th>
              </tr>
            </thead>
            <tbody>
              {projects.filter((p) => normalizeProject(p).状态 === 'COMPLETED').length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-dnd-text-muted text-xs">暂无已完成项</td>
                </tr>
              )}
              {[...projects.map((p, i) => ({ p, i }))]
                .filter(({ p }) => normalizeProject(p).状态 === 'COMPLETED')
                .filter(({ p }) => canSeeCompletedRow(p, isAdmin, userName))
                .sort((a, b) => {
                  const ta = new Date(a.p.完成时间 || 0).getTime()
                  const tb = new Date(b.p.完成时间 || 0).getTime()
                  return tb - ta
                })
                .map(({ p, i }) => {
                  const claimed = isCraftFeeClaimed(p)
                  const delName = (p.委托角色 && characters.find((c) => c.id === p.委托角色)?.name) || '—'
                  const makerName = (p.实际制作者 && characters.find((c) => c.id === p.实际制作者)?.name) || '—'
                  const costGp = parseCostFromString(p.消耗金额)
                  const modId = currentModuleId ?? 'default'
                  return (
                    <tr
                      key={p.id ?? i}
                      className="border-t border-gray-700/80 hover:bg-gray-800/30 cursor-grab active:cursor-grabbing"
                      draggable
                      title={claimed ? '按住拖入上方「公家次元袋」卡片（须已领取结算）' : '请先点击「领取结算」后再拖入次元袋'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          DND_CRAFT_COMPLETED_MIME,
                          JSON.stringify({ moduleId: modId, projectId: p.id, index: i }),
                        )
                        e.dataTransfer.setData('text/plain', `dnd-craft:${p.id ?? i}`)
                        e.dataTransfer.effectAllowed = 'copy'
                        e.currentTarget.classList.add('opacity-60')
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove('opacity-60')}
                    >
                      <td className="py-2 px-2 text-center align-middle text-dnd-text-muted">
                        <GripVertical className="w-4 h-4 mx-auto opacity-70" aria-hidden />
                      </td>
                      <td className="py-2 px-3 text-dnd-text-body tabular-nums whitespace-nowrap">{formatCompleteTime(p.完成时间)}</td>
                      <td className="py-2 px-3 text-white font-medium">{p.物品名称 || '—'}</td>
                      <td className="py-2 px-3 text-dnd-text-body">{MAGIC_ITEM_TYPES.find((t) => t.id === p.类型)?.label ?? p.类型}</td>
                      <td className="py-2 px-3 text-dnd-text-body">{delName}</td>
                      <td className="py-2 px-3 text-dnd-text-body">{makerName}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-dnd-text-body">{Math.ceil(costGp)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-dnd-text-body">{p.消耗经验 ?? 0}</td>
                      <td className="py-2 px-3 text-xs">
                        {claimed ? <span className="text-emerald-400/95">已结算</span> : <span className="text-amber-400/95">待领取</span>}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {!claimed && (
                          <button type="button" onClick={() => openClaimModal(i)} className="px-2 py-1 rounded-md bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium mr-1">
                            领取结算
                          </button>
                        )}
                        {claimed && (
                          <button type="button" onClick={() => { setDepositProjectIndex(i); setDepositToWarehouse(true); setDepositCharId(''); }} title="存入" className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/20 align-middle mr-1">
                            <Package size={16} />
                          </button>
                        )}
                        <button type="button" onClick={() => { if (confirm('确定从列表中移除此项？未领取的条目移除后无需再支付。')) handleRemove(i); }} title="移除" className="p-1.5 rounded text-gray-400 hover:bg-gray-600/50 align-middle">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 领取结算 */}
      {claimProjectIndex != null && projects[claimProjectIndex] && !isCraftFeeClaimed(projects[claimProjectIndex]) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={() => !isClaiming && setClaimProjectIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="font-display font-semibold text-white">领取结算</h2>
              <p className="text-dnd-text-muted text-sm mt-1">{projects[claimProjectIndex].物品名称 || '未命名'}</p>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-dnd-text-body">
                将扣除制作成本 <span className="text-dnd-gold-light font-bold tabular-nums">{Math.ceil(parseCostFromString(projects[claimProjectIndex].消耗金额))} GP</span>
                {Number(projects[claimProjectIndex].消耗经验) > 0 && (
                  <>
                    {' '}与工匠经验 <span className="text-dnd-gold-light font-bold tabular-nums">{projects[claimProjectIndex].消耗经验} XP</span>
                    （从「{(projects[claimProjectIndex].实际制作者 && getCharacter(projects[claimProjectIndex].实际制作者)?.name) || '实际制作者'}」）
                  </>
                )}
                。
              </p>
              <div>
                <span className="block text-dnd-text-muted text-xs mb-2">金币来源</span>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="claim-cost" checked={claimCostSource === 'vault'} onChange={() => setClaimCostSource('vault')} />
                    <span>公费（团队金库 GP）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="claim-cost" checked={claimCostSource === 'personal'} onChange={() => setClaimCostSource('personal')} />
                    <span>个人费用（指定角色钱包 GP）</span>
                  </label>
                </div>
              </div>
              {claimCostSource === 'personal' && (
                <div>
                  <label className="block text-dnd-text-muted text-xs mb-1">支付角色</label>
                  <select value={claimPayerCharId} onChange={(e) => setClaimPayerCharId(e.target.value)} className={inputClass + ' h-10 w-full'}>
                    <option value="">— 选择 —</option>
                    {delegateCharacterOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || '未命名'}（GP {Math.round(getCharacterWallet(c.id).gp ?? 0)}）
                      </option>
                    ))}
                  </select>
                  <p className="text-dnd-text-muted text-[10px] mt-1">玩家仅能看到自己创建的角色；DM 可选任意角色。</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
              <button type="button" disabled={isClaiming} onClick={() => setClaimProjectIndex(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50">取消</button>
              <button type="button" disabled={isClaiming} onClick={handleConfirmClaim} className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold disabled:opacity-50">
                {isClaiming ? '处理中…' : '确认扣除并领取'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 存入弹窗 */}
      {depositProjectIndex != null && projects[depositProjectIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDepositProjectIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="font-display font-semibold text-white">存入</h2>
              <p className="text-dnd-text-muted text-sm mt-1">{projects[depositProjectIndex].物品名称 || '未命名'}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <button type="button" onClick={() => setDepositToWarehouse(true)} className={`flex-1 py-2 rounded-lg border font-medium text-sm ${depositToWarehouse ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  存入仓库
                </button>
                <button type="button" onClick={() => setDepositToWarehouse(false)} className={`flex-1 py-2 rounded-lg border font-medium text-sm ${!depositToWarehouse ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  存入角色
                </button>
              </div>
              {!depositToWarehouse && (
                <div>
                  <label className="block text-dnd-text-muted text-xs mb-1">选择角色</label>
                  <select value={depositCharId} onChange={(e) => setDepositCharId(e.target.value)} className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red">
                    <option value="">— 选择 —</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
              <button type="button" onClick={() => setDepositProjectIndex(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">取消</button>
              <button type="button" onClick={confirmDeposit} disabled={!depositToWarehouse && !depositCharId} className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
