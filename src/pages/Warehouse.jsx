import { useState, useEffect, useMemo, Fragment } from 'react'
import { Package, Pencil, Trash2, GripVertical } from 'lucide-react'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import {
  getNormalizedBagModules,
  entryBelongsToBagModule,
  compareBagInventoryDisplayOrder,
  applyBagItemPatch,
} from '../lib/bagOfHoldingModules'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { logTeamActivity } from '../lib/activityLog'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { CURRENCY_CONFIG, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { getTeamVault, loadTeamVaultIntoCache } from '../lib/currencyStore'
import {
  DND_TEAM_VAULT_CURRENCY_MIME,
  parseTeamVaultCurrencyDragPayload,
  depositVaultCurrencyToPublicBag,
} from '../lib/teamCurrencyPublicBags'
import { getWarehouse, loadWarehouseIntoCache, addToWarehouse, removeFromWarehouse, updateWarehouseItem, reorderWarehouse, setWarehouse } from '../lib/warehouseStore'
import { getCraftingProjects, updateCraftingProject } from '../lib/craftingStore'
import {
  normalizeProject,
  isCraftFeeClaimed,
  isCraftDeposited,
  DND_CRAFT_COMPLETED_MIME,
  parseCraftCompletedDragPayload,
} from '../lib/craftingProjectUtils'
import { getAllCharacters, updateCharacter, getCharacter } from '../lib/characterStore'
import { getItemWeightLb, parseWeightString, getWalletCurrencyStackWeightLb } from '../lib/encumbrance'
import ItemAddForm from '../components/ItemAddForm'
import CurrencyPanel from '../components/CurrencyPanel'
import MagicCraftingPanel from '../components/MagicCraftingPanel'
import { NumberStepper } from '../components/BuffForm'
import { inputClass } from '../lib/inputStyles'
import { appendContainedSpellsBrief } from '../lib/containedSpellBrief'

const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider'

export default function Warehouse() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const [list, setList] = useState([])
  const [addFormOpen, setAddFormOpen] = useState(false)
  /** 存入角色弹窗：团队储物栏行 | 公家次元袋内物品行 */
  const [depositContext, setDepositContext] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositQty, setDepositQty] = useState(1)
  /** 编辑公家次元袋内物品（与储物栏编辑分离） */
  const [bagItemEdit, setBagItemEdit] = useState(null)
  const [isDepositing, setIsDepositing] = useState(false)
  const [transferHint, setTransferHint] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [charRefresh, setCharRefresh] = useState(0)
  const [vaultTick, setVaultTick] = useState(0)

  const characters = useMemo(() => {
    void charRefresh
    return getAllCharacters(currentModuleId)
  }, [currentModuleId, charRefresh])

  /** 公家且有个数>0 的次元袋模块（角色 + 模块） */
  const publicBagTargets = useMemo(() => {
    const out = []
    for (const c of characters) {
      const mods = getNormalizedBagModules(c)
      for (const mod of mods) {
        if (normalizeBagOfHoldingVisibility(mod.visibility) !== 'public') continue
        if ((mod.bagCount || 0) <= 0) continue
        out.push({ character: c, mod })
      }
    }
    return out
  }, [characters])

  useEffect(() => {
    const h = () => setCharRefresh((x) => x + 1)
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await loadWarehouseIntoCache(currentModuleId)
      await loadTeamVaultIntoCache(currentModuleId)
      if (!cancelled) {
        setList(getWarehouse(currentModuleId))
        setVaultTick((x) => x + 1)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentModuleId])

  useEffect(() => {
    const h = () => setVaultTick((x) => x + 1)
    window.addEventListener('dnd-realtime-team-vault', h)
    return () => window.removeEventListener('dnd-realtime-team-vault', h)
  }, [])

  useEffect(() => {
    const h = () => {
      loadWarehouseIntoCache(currentModuleId).then(() => {
        setList(getWarehouse(currentModuleId))
      })
    }
    window.addEventListener('dnd-realtime-warehouse', h)
    return () => window.removeEventListener('dnd-realtime-warehouse', h)
  }, [currentModuleId])

  const refreshList = () => setList(getWarehouse(currentModuleId))

  /** 团队金库余额 → 储物栏顶部展示的虚拟行（数量只读，在「货币与金库」修改） */
  const teamVault = useMemo(() => {
    void vaultTick
    return getTeamVault(currentModuleId)
  }, [currentModuleId, vaultTick])

  const vaultWarehouseRows = useMemo(
    () => CURRENCY_CONFIG.filter((c) => (Number(teamVault[c.id]) || 0) > 0).map((c) => ({ currencyId: c.id, qty: Number(teamVault[c.id]) || 0 })),
    [teamVault],
  )

  /** 公家次元袋行 → 团队储物栏（与角色背包拖动物品逻辑一致：使用独立 MIME + copyMove） */
  function moveBagItemToWarehouse(charId, invIdx) {
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    const entry = ch.inventory[invIdx]
    if (!entry?.inBagOfHolding) return
    if (entry.walletCurrencyId) {
      alert('钱币堆请先在角色卡拖回钱包后再存入团队仓库。')
      return
    }
    const qty = Math.max(1, Number(entry.qty) ?? 1)
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    const nm = (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—')
    const whPayload = {
      itemId: entry.itemId ?? undefined,
      name: nm,
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty,
      isAttuned: Boolean(entry.isAttuned),
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
    }
    const nextInv = ch.inventory.filter((_, i) => i !== invIdx)
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => addToWarehouse(currentModuleId, whPayload))
      .then(() => {
        refreshList()
        setCharRefresh((x) => x + 1)
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将「${ch.name || '未命名'}」公家次元袋中的「${nm}」移入团队储物栏`,
          })
        }
      })
      .catch((err) => {
        console.error('[Warehouse] 次元袋物品移入储物栏失败', err)
        alert('移入失败，请重试')
      })
  }

  const handleRemove = (i) => {
    Promise.resolve(removeFromWarehouse(currentModuleId, i)).then(refreshList)
  }

  const reorderList = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    Promise.resolve(reorderWarehouse(currentModuleId, fromIndex, toIndex)).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  /** 同名物品（显示名称一致）可合并数量 */
  const isSameItemForMerge = (a, b) => a && b && displayName(a) === displayName(b)

  /** 与 wb: 区分，避免 plain 被误解析 */
  const WAREHOUSE_PLAIN_PREFIX = 'dnd-wh:'

  const parseWarehouseDragIndex = (dataTransfer) => {
    const custom = dataTransfer.getData('text/dnd-warehouse-index')
    if (custom != null && custom !== '') {
      const n = parseInt(custom, 10)
      if (!Number.isNaN(n)) return n
    }
    const plain = (dataTransfer.getData('text/plain') || '').trim()
    if (plain.startsWith(WAREHOUSE_PLAIN_PREFIX)) {
      const n = parseInt(plain.slice(WAREHOUSE_PLAIN_PREFIX.length), 10)
      return Number.isNaN(n) ? null : n
    }
    if (/^\d+$/.test(plain)) return parseInt(plain, 10)
    return null
  }

  /** 公家次元袋接拖：copyMove 下用 move 更易被浏览器接受放下 */
  const dragOverPublicBagZone = (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (dt.effectAllowed === 'copyMove' || dt.effectAllowed === 'all' || dt.effectAllowed === 'move' || dt.effectAllowed === 'linkMove') {
      dt.dropEffect = 'move'
    } else if (dt.effectAllowed === 'copy') {
      dt.dropEffect = 'copy'
    } else {
      dt.dropEffect = 'move'
    }
  }

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/dnd-warehouse-index', String(index))
    e.dataTransfer.setData('text/plain', `${WAREHOUSE_PLAIN_PREFIX}${index}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')
  const handleDragOver = (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (dt.effectAllowed === 'copyMove' || dt.effectAllowed === 'all') {
      dt.dropEffect = 'move'
    } else {
      dt.dropEffect = 'move'
    }
  }
  /** 储物栏内拖拽：释放在表格任意位置 → 移到列表末尾；与末尾同名则合并（不必对准某一行） */
  const mergeOrMoveWarehouseItemToEnd = (fromIndex) => {
    if (list.length <= 1) return
    const lastIdx = list.length - 1
    if (fromIndex === lastIdx) return
    const source = list[fromIndex]
    const target = list[lastIdx]
    if (isSameItemForMerge(source, target)) {
      setEditingIndex(null)
      const qtyT = Math.max(1, Number(target?.qty) ?? 1)
      const qtyS = Math.max(1, Number(source?.qty) ?? 1)
      const chargeT = Number(target?.charge) || 0
      const chargeS = Number(source?.charge) || 0
      const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
      const next = list.filter((_, i) => i !== fromIndex)
      const mergeIdx = fromIndex < lastIdx ? lastIdx - 1 : lastIdx
      next[mergeIdx] = merged
      Promise.resolve(setWarehouse(currentModuleId, next)).then(refreshList)
    } else {
      reorderList(fromIndex, lastIdx)
    }
  }

  /** 团队储物栏整块拖放区：次元袋→仓库；栏内物品→末尾/合并 */
  const handleWarehouseTableDrop = (e) => {
    e.preventDefault()
    const wbChar = e.dataTransfer.getData('text/dnd-warehouse-bag-char')
    const wbInvRaw = e.dataTransfer.getData('text/dnd-warehouse-bag-inv')
    if (wbChar && wbInvRaw !== '') {
      const invIdx = parseInt(wbInvRaw, 10)
      if (!Number.isNaN(invIdx)) {
        moveBagItemToWarehouse(wbChar, invIdx)
      }
      return
    }
    const fromIndex = parseWarehouseDragIndex(e.dataTransfer)
    if (fromIndex == null || fromIndex < 0 || fromIndex >= list.length) return
    mergeOrMoveWarehouseItemToEnd(fromIndex)
  }

  const setQty = (i, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const setCharge = (i, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { charge: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const startEdit = (i) => {
    if (list[i]) setEditingIndex(i)
  }

  const applyEditSave = (entry) => {
    if (editingIndex == null) return
    Promise.resolve(updateWarehouseItem(currentModuleId, editingIndex, entry)).then(() => { refreshList(); setEditingIndex(null) })
  }

  const buildInvEntryForCharacter = (entry, q) => {
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    return {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: entry.itemId ?? undefined,
      name: (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—'),
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty: q,
      isAttuned: Boolean(entry.isAttuned),
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      inBagOfHolding: false,
      bagModuleId: undefined,
      bagSlotId: undefined,
    }
  }

  const openDeposit = (i) => {
    const e = list[i]
    if (!e) return
    setDepositContext({ type: 'warehouse', index: i })
    setDepositCharId(characters[0]?.id ?? '')
    setDepositQty(1)
  }

  const openDepositFromPublicBag = (sourceCharId, invIdx) => {
    const ch = getCharacter(sourceCharId)
    const e = ch?.inventory?.[invIdx]
    if (!e) return
    setDepositContext({ type: 'bag', sourceCharId, invIdx })
    setDepositCharId(characters[0]?.id ?? '')
    setDepositQty(1)
  }

  const closeDepositModal = () => {
    setDepositContext(null)
    setDepositCharId('')
    setDepositQty(1)
  }

  const confirmDeposit = () => {
    if (!depositContext || !depositCharId || isDepositing) return
    const char = characters.find((c) => c.id === depositCharId)
    if (!char) {
      closeDepositModal()
      return
    }

    if (depositContext.type === 'warehouse') {
      const depositIndex = depositContext.index
      const entry = list[depositIndex]
      if (!entry) {
        closeDepositModal()
        return
      }
      const q = Math.max(1, Math.min(depositQty, Number(entry.qty) ?? 1))
      const invEntry = buildInvEntryForCharacter(entry, q)
      const inv = char.inventory ?? []
      const prevList = list
      const nextQty = (Number(entry.qty) ?? 1) - q
      const optimisticList = nextQty <= 0
        ? list.filter((_, i) => i !== depositIndex)
        : list.map((x, i) => (i === depositIndex ? { ...x, qty: nextQty } : x))
      setList(optimisticList)
      setIsDepositing(true)
      setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')

      const removePromise = q >= (Number(entry.qty) ?? 1)
        ? Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex))
        : Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex, q))
      const saveInventoryPromise = Promise.resolve(updateCharacter(depositCharId, { inventory: [...inv, invEntry] }))
      Promise.all([saveInventoryPromise, removePromise])
        .then(() => {
          if (user?.name) {
            logTeamActivity({
              actor: user.name,
              moduleId: currentModuleId,
              summary: `玩家 ${user.name} 将团队仓库「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的背包`,
            })
          }
          refreshList()
        })
        .catch((err) => {
          console.error('[Warehouse] 存入角色失败，已回滚列表', err)
          setList(prevList)
          alert('存入失败，已回滚，请重试')
        })
        .finally(() => {
          setIsDepositing(false)
          setTransferHint('')
        })
      closeDepositModal()
      return
    }

    // 公家次元袋 → 目标角色身上背包（非袋内）
    const { sourceCharId, invIdx } = depositContext
    const sourceCh = getCharacter(sourceCharId)
    if (!sourceCh || !Array.isArray(sourceCh.inventory)) {
      closeDepositModal()
      return
    }
    const entry = sourceCh.inventory[invIdx]
    if (!entry) {
      closeDepositModal()
      return
    }
    const q = Math.max(1, Math.min(depositQty, Number(entry.qty) ?? 1))
    const invEntry = buildInvEntryForCharacter(entry, q)

    const sourceName = sourceCh.name || '未命名'
    setIsDepositing(true)
    setTransferHint('物品转移中…')

    const applyBagSourceAfterPull = (inv) => {
      const nextQtyLeft = (Number(entry.qty) ?? 1) - q
      if (nextQtyLeft <= 0) return inv.filter((_, i) => i !== invIdx)
      return inv.map((e, i) => (i === invIdx ? { ...e, qty: nextQtyLeft } : e))
    }

    const run = () => {
      if (sourceCharId === depositCharId) {
        const inv = [...(sourceCh.inventory ?? [])]
        const nextInv = applyBagSourceAfterPull(inv)
        nextInv.push(invEntry)
        return Promise.resolve(updateCharacter(sourceCharId, { inventory: nextInv }))
      }
      const nextSource = applyBagSourceAfterPull([...(sourceCh.inventory ?? [])])
      const targetInv = [...(char.inventory ?? []), invEntry]
      return Promise.resolve(updateCharacter(sourceCharId, { inventory: nextSource })).then(() =>
        updateCharacter(depositCharId, { inventory: targetInv }),
      )
    }

    run()
      .then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将「${sourceName}」公家次元袋中的「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的背包`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 次元袋内存入角色失败', err)
        alert('存入失败，请重试')
      })
      .finally(() => {
        setIsDepositing(false)
        setTransferHint('')
        closeDepositModal()
      })
  }

  const applyBagItemEditSave = (entry) => {
    if (!bagItemEdit) return
    const ch = getCharacter(bagItemEdit.charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    const idx = bagItemEdit.invIdx
    const old = ch.inventory[idx]
    if (!old) return
    const merged = {
      ...old,
      ...entry,
      id: old.id,
      inBagOfHolding: true,
      bagModuleId: old.bagModuleId,
      bagSlotId: old.bagSlotId,
    }
    const nextInv = ch.inventory.map((e, i) => (i === idx ? merged : e))
    Promise.resolve(updateCharacter(bagItemEdit.charId, { inventory: nextInv })).then(() => {
      setCharRefresh((x) => x + 1)
      setBagItemEdit(null)
    })
  }

  /** 已完成制作（已领取）拖入公家次元袋：写入袋内 inventory 并标记已入库（列表保留灰色记录） */
  const depositCraftProjectToPublicBag = (charId, bagModId, projectIndex) => {
    const list = getCraftingProjects(currentModuleId)
    const p = list[projectIndex]
    if (!p) return
    const norm = normalizeProject(p)
    if (norm.状态 !== 'COMPLETED') {
      alert('仅可将已完成的制作移入次元袋')
      return
    }
    if (!isCraftFeeClaimed(p)) {
      alert('请先在「已完成物品列表」中点击「领取结算」，支付制作成本与工匠经验后再拖入次元袋。')
      return
    }
    if (isCraftDeposited(p)) {
      alert('该制作项已入库，仅作记录，无法再次拖入次元袋。')
      return
    }
    const ownerName = user?.name?.trim() || ''
    if (!isAdmin && ownerName) {
      const del = (p.委托角色 ?? '').trim()
      if (del) {
        const delegateChar = getCharacter(del)
        if (delegateChar?.owner !== ownerName) {
          alert('无权操作此制作项')
          return
        }
      }
    }
    const ch = getCharacter(charId)
    if (!ch) return
    const name = p.物品名称?.trim() || '未命名魔法物品'
    const desc = p.详细介绍?.trim() ?? ''
    const qty = Math.max(1, Number(p.数量) || 1)
    let charge = 0
    if (p.类型 === 'wand' || p.类型 === 'staff') {
      charge = Math.max(0, Number(p.充能次数) || 0)
    }
    const invEntry = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name,
      详细介绍: desc,
      qty,
      charge,
      攻击: '',
      伤害: '',
      附注: '',
      isAttuned: false,
      magicBonus: 0,
      inBagOfHolding: true,
      bagModuleId: bagModId,
    }
    const inv = ch.inventory ?? []
    const nowIso = new Date().toISOString()
    Promise.resolve(updateCharacter(charId, { inventory: [...inv, invEntry] }))
      .then(() =>
        updateCraftingProject(currentModuleId, projectIndex, {
          已入库: true,
          入库时间: nowIso,
          入库去向: 'public_bag',
          入库角色Id: charId,
          入库次元袋模块Id: bagModId,
        }),
      )
      .then(() => {
        window.dispatchEvent(new CustomEvent('dnd-realtime-crafting'))
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将制作的「${name}」拖入了角色「${ch.name || '未命名'}」的公家次元袋`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 制作物品拖入次元袋失败', err)
        alert('存入次元袋失败，请重试')
      })
  }

  /** 团队储物栏行拖入某角色公家次元袋：写入该角色 inventory 并从仓库移除 */
  const depositWarehouseToBag = (warehouseIndex, charId, moduleId) => {
    const entry = list[warehouseIndex]
    if (!entry || !charId || !moduleId) return
    const ch = getCharacter(charId)
    if (!ch) return
    const q = Math.max(1, Number(entry.qty) ?? 1)
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    const invEntry = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: entry.itemId ?? undefined,
      name: (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—'),
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty: q,
      isAttuned: false,
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      inBagOfHolding: true,
      bagModuleId: moduleId,
    }
    const inv = ch.inventory ?? []
    const prevList = list
    const nextQty = (Number(entry.qty) ?? 1) - q
    const optimisticList =
      nextQty <= 0 ? list.filter((_, i) => i !== warehouseIndex) : list.map((x, i) => (i === warehouseIndex ? { ...x, qty: nextQty } : x))
    setList(optimisticList)
    setTransferHint('物品存入次元袋中…')
    const removePromise =
      q >= (Number(entry.qty) ?? 1)
        ? Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex))
        : Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex, q))
    Promise.resolve(updateCharacter(charId, { inventory: [...inv, invEntry] }))
      .then(() => removePromise)
      .then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将团队仓库「${displayName(entry)}」存入了角色「${ch.name || '未命名'}」的公家次元袋`,
          })
        }
        refreshList()
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 存入次元袋失败', err)
        setList(prevList)
        alert('存入次元袋失败，请重试')
      })
      .finally(() => setTransferHint(''))
  }

  /** 团队储物栏行释放在公家次元袋卡片内（含表格格、按钮上方）；亦接受制作工厂「已完成」拖入 */
  const handlePublicBagWarehouseDrop = (e, charId, moduleId) => {
    e.preventDefault()
    e.stopPropagation()
    const craftRaw = e.dataTransfer.getData(DND_CRAFT_COMPLETED_MIME)
    const craftPayload = parseCraftCompletedDragPayload(craftRaw)
    const vaultCurRaw = e.dataTransfer.getData(DND_TEAM_VAULT_CURRENCY_MIME)
    const vaultCurPayload = parseTeamVaultCurrencyDragPayload(vaultCurRaw)
    if (vaultCurPayload) {
      const mod = currentModuleId ?? 'default'
      if (vaultCurPayload.moduleId !== mod) {
        alert('数据不属于当前模组')
        return
      }
      setTransferHint('正在将金库货币移入次元袋…')
      Promise.resolve(
        depositVaultCurrencyToPublicBag(
          currentModuleId,
          charId,
          moduleId,
          vaultCurPayload.currencyId,
          vaultCurPayload.qty,
        ),
      )
        .then((r) => {
          if (!r.success) {
            alert(r.error || '移入次元袋失败')
            return
          }
          if (user?.name) {
            const ch = getCharacter(charId)
            const cfg = getCurrencyById(vaultCurPayload.currencyId)
            const cname = cfg ? getCurrencyDisplayName(cfg) : vaultCurPayload.currencyId
            logTeamActivity({
              actor: user.name,
              moduleId: currentModuleId,
              summary: `玩家 ${user.name} 将团队金库「${cname}」×${vaultCurPayload.qty} 移入了「${ch?.name || '未命名'}」的公家次元袋`,
            })
          }
          setVaultTick((x) => x + 1)
          setCharRefresh((x) => x + 1)
        })
        .catch((err) => {
          console.error('[Warehouse] 金库货币移入次元袋失败', err)
          alert('移入失败，请重试')
        })
        .finally(() => setTransferHint(''))
      return
    }

    if (craftPayload) {
      const mod = currentModuleId ?? 'default'
      if (craftPayload.moduleId !== mod) {
        alert('制作数据不属于当前模组')
        return
      }
      const cList = getCraftingProjects(currentModuleId)
      let pIdx = -1
      if (craftPayload.projectId) {
        pIdx = cList.findIndex((x) => x.id === craftPayload.projectId)
      }
      if (pIdx < 0 && typeof craftPayload.index === 'number' && craftPayload.index >= 0 && craftPayload.index < cList.length) {
        pIdx = craftPayload.index
      }
      if (pIdx < 0) {
        alert('找不到该制作项，请刷新页面后重试')
        return
      }
      depositCraftProjectToPublicBag(charId, moduleId, pIdx)
      return
    }
    if (e.dataTransfer.getData('text/dnd-warehouse-bag-char')) return
    const idx = parseWarehouseDragIndex(e.dataTransfer)
    if (idx != null && idx >= 0 && idx < list.length) {
      depositWarehouseToBag(idx, charId, moduleId)
    }
  }

  const displayName = (entry) => {
    if (entry?.walletCurrencyId) {
      const cfg = getCurrencyById(entry.walletCurrencyId)
      return getCurrencyDisplayName(cfg) || entry?.name || '—'
    }
    if (entry.itemId) {
      const item = getItemById(entry.itemId)
      return entry.name?.trim() || getItemDisplayName(item)
    }
    return entry.name || '?'
  }

  const handlePublicBagDragStart = (e, charId, invIdx) => {
    e.dataTransfer.setData('text/dnd-warehouse-bag-char', charId)
    e.dataTransfer.setData('text/dnd-warehouse-bag-inv', String(invIdx))
    e.dataTransfer.setData('text/plain', `wb:${charId}:${invIdx}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-50')
  }

  /** 公家次元袋内物品：内联修改充能 / 数量（含钱币堆数量；钱币为 0 时移除该行并刷新金库合计） */
  const patchPublicBagInventoryItem = (charId, invIdx, patch) => {
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    if (invIdx < 0 || invIdx >= ch.inventory.length) return
    const entry = ch.inventory[invIdx]
    if (!entry?.inBagOfHolding) return
    const next = applyBagItemPatch(entry, patch)
    const nextInv =
      next.walletCurrencyId && Number(next.qty) <= 0
        ? ch.inventory.filter((_, i) => i !== invIdx)
        : ch.inventory.map((e, i) => (i === invIdx ? next : e))
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => {
        window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 更新次元袋物品失败', err)
        alert('更新失败，请重试')
      })
  }

  const removeBagItemFromCharacter = (charId, invIdx) => {
    if (!window.confirm('确定删除该物品？将从角色次元袋中永久移除，无法恢复。')) return
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    if (invIdx < 0 || invIdx >= ch.inventory.length) return
    const entry = ch.inventory[invIdx]
    const nextInv = ch.inventory.filter((_, i) => i !== invIdx)
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => {
        if (user?.name && entry) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 从团队仓库视图中删除了「${ch.name || '未命名'}」次元袋内的「${displayName(entry)}」`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 删除次元袋物品失败', err)
        alert('删除失败，请重试')
      })
  }

  const depositModalEntry = useMemo(() => {
    if (!depositContext) return null
    if (depositContext.type === 'warehouse') return list[depositContext.index] ?? null
    const ch = getCharacter(depositContext.sourceCharId)
    return ch?.inventory?.[depositContext.invIdx] ?? null
  }, [depositContext, list, charRefresh])

  const getEntryWeight = (entry) => {
    if (entry?.walletCurrencyId) {
      const q = Math.max(1, Number(entry.qty) || 1)
      const tw = getWalletCurrencyStackWeightLb(entry.walletCurrencyId, q)
      return q > 0 ? tw / q : 0
    }
    if (entry?.重量 != null && entry?.重量 !== '') return parseWeightString(entry.重量)
    if (!entry?.itemId) return 0
    return getItemWeightLb(getItemById(entry.itemId))
  }

  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    const range = entry?.攻击距离?.trim()
    const parts = []
    if (brief) parts.push(brief)
    if (range) parts.push(`攻击距离 ${range}`)
    let out = ''
    if (parts.length) out = parts.join('；')
    else if (entry?.附注?.trim()) out = entry.附注.trim()
    else out = getItemById(entry?.itemId)?.详细介绍 ?? ''
    return appendContainedSpellsBrief(entry?.effects, out)
  }

  return (
    <div className="p-4 pb-40 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        团队仓库
      </h1>

      {/* 货币与金库 */}
      <section className="mb-6">
        <h2 className="text-dnd-text-muted text-sm font-medium mb-3 uppercase tracking-wider">货币与金库</h2>
        <CurrencyPanel />
      </section>

      <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-4 space-y-4">
        <div className="px-1.5 py-1 border-b border-white/10 flex items-center gap-2 flex-wrap">
          <Package className="w-4 h-4 text-dnd-gold-light shrink-0" aria-hidden />
          <h3 className={subTitleClass + ' mb-0'}>次元袋 · 团队可见储物</h3>
        </div>
        <p className="text-dnd-text-muted text-[11px] leading-relaxed -mt-2">
          游玩时多以「背上次元袋」当队伍储物。<strong className="text-dnd-text-body">新建次元袋模块默认为「公家」</strong>：全体玩家在本页可查看该袋内物品并调整数量/充能；「私人」则仅在该角色卡可见、团队仓库不列出。袋内<strong className="text-dnd-text-body">钱币堆始终置顶</strong>显示。下方「团队储物栏」为直接存入共享列表的物品（不经过某角色的袋内）。
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-dnd-text-muted text-[10px] font-bold uppercase tracking-wider mb-0 min-w-0 flex-1">
              公家次元袋（与团队储物栏相同表格；拖入即写入对应角色卡）
            </h4>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAddFormOpen(true)}
                className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors"
              >
                添加物品
              </button>
              <ItemAddForm
                open={addFormOpen}
                onClose={() => setAddFormOpen(false)}
                onSave={(entry) => {
                  Promise.resolve(addToWarehouse(currentModuleId, entry)).then(() => {
                    const nm = entry?.name?.trim() || entry?.itemId || '物品'
                    if (user?.name) {
                      logTeamActivity({
                        actor: user.name,
                        moduleId: currentModuleId,
                        summary: `玩家 ${user.name} 向团队仓库放入了「${nm}」`,
                      })
                    }
                    refreshList()
                    setAddFormOpen(false)
                  })
                }}
                submitLabel="放入仓库"
                inventory={list}
              />
              <ItemAddForm
                open={editingIndex !== null}
                onClose={() => setEditingIndex(null)}
                onSave={applyEditSave}
                submitLabel="保存"
                editEntry={editingIndex != null ? list[editingIndex] : null}
                inventory={list}
              />
              <ItemAddForm
                open={bagItemEdit != null}
                onClose={() => setBagItemEdit(null)}
                onSave={applyBagItemEditSave}
                submitLabel="保存"
                editEntry={
                  bagItemEdit
                    ? getCharacter(bagItemEdit.charId)?.inventory?.[bagItemEdit.invIdx] ?? null
                    : null
                }
                inventory={bagItemEdit ? getCharacter(bagItemEdit.charId)?.inventory ?? [] : []}
              />
            </div>
          </div>
          {publicBagTargets.length === 0 ? (
            <div className="rounded-lg border border-white/10 py-4 px-3 text-gray-500 text-center text-[11px]">
              暂无公家次元袋。请在角色卡将次元袋设为「公家」，且「次元袋个数」至少 1。
            </div>
          ) : (
            publicBagTargets.map(({ character: c, mod }) => {
              const mods = getNormalizedBagModules(c)
              const bagItemRows = (c.inventory || [])
                .map((entry, invIdx) => ({ entry, invIdx }))
                .filter(({ entry }) => entryBelongsToBagModule(entry, mod, mods))
                .sort((a, b) => compareBagInventoryDisplayOrder(a.entry, a.invIdx, b.entry, b.invIdx))
              const bagTotalLb =
                Math.round(
                  bagItemRows.reduce((s, { entry }) => {
                    const q = Math.max(1, Number(entry?.qty) ?? 1)
                    return s + getEntryWeight(entry) * q
                  }, 0) * 100,
                ) / 100
              return (
                <div
                  key={`${c.id}-${mod.id}`}
                  className="rounded-lg border border-white/10 overflow-hidden ring-offset-0"
                  onDragEnter={(e) => {
                    e.preventDefault()
                  }}
                  onDragOverCapture={dragOverPublicBagZone}
                  onDragOver={dragOverPublicBagZone}
                  onDrop={(e) => handlePublicBagWarehouseDrop(e, c.id, mod.id)}
                >
                  <div className="px-2 py-1.5 border-b border-white/10 flex items-center justify-between gap-2 min-w-0">
                    <span className="text-dnd-gold-light text-[11px] font-semibold truncate min-w-0">
                      {c.name || '未命名'} 的公家次元袋
                    </span>
                    <span
                      className="text-dnd-text-muted text-[10px] tabular-nums shrink-0"
                      title="袋内物品合计重量（不含次元袋自重）"
                    >
                      合计{' '}
                      <span className="text-dnd-gold-light/95 font-semibold">{bagTotalLb}</span> lb
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table
                      className="inventory-table w-full text-xs"
                      style={{ tableLayout: 'fixed', minWidth: '480px' }}
                      onDragOver={dragOverPublicBagZone}
                    >
                      <colgroup>
                        <col style={{ width: '1.9%' }} />
                        <col style={{ width: '12.38%' }} />
                        <col style={{ width: '9.52%' }} />
                        <col style={{ width: '59.52%' }} />
                        <col style={{ width: '9.52%' }} />
                        <col style={{ width: '7.14%' }} />
                      </colgroup>
                      <thead>
                        <tr
                          className="bg-[#1b2738]/85 text-dnd-text-muted text-[10px] uppercase tracking-wider"
                          style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                          onDragOver={dragOverPublicBagZone}
                        >
                          <th className="py-0 px-4 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} title="拖拽" />
                          <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>名称</th>
                          <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>充能</th>
                          <th className="py-0 px-4 font-semibold min-w-0 border-l border-white/10 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                          <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>数量</th>
                          <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} />
                        </tr>
                      </thead>
                      <tbody onDragOver={dragOverPublicBagZone}>
                        <tr className="border-t border-emerald-600/35 bg-emerald-950/20" onDragOver={dragOverPublicBagZone}>
                          <td
                            colSpan={6}
                            className="py-2.5 px-3 text-emerald-100/95 text-[11px] leading-relaxed [&_*]:pointer-events-none"
                          >
                            <strong className="text-white">拖入区：</strong>「团队储物栏」实体物品、<strong className="text-white">团队金库货币行</strong>，或下方「制作工厂」<strong className="text-white">已完成且已领取</strong>的制作行，拖到<strong className="text-white">本卡片任意位置</strong>：货币从账面入袋仍计团队金库合计；储物栏物品扣除仓库；制作物品直接入袋（工厂列表保留灰色记录，不删除条目）。
                          </td>
                        </tr>
                        {bagItemRows.length === 0 ? (
                          <tr className="border-t border-white/10" onDragOver={dragOverPublicBagZone}>
                            <td colSpan={6} className="py-3 text-center text-gray-500 text-[11px]">
                              袋内暂无物品
                            </td>
                          </tr>
                        ) : (
                          bagItemRows.map(({ entry, invIdx }) => {
                            const qty = Math.max(1, Number(entry?.qty) ?? 1)
                            const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                            const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
                            const nameExtra =
                              stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0 ? (
                                <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                                  {stoneVal}层
                                </span>
                              ) : (Number(entry.magicBonus) || 0) > 0 ? (
                                <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                              ) : null

                            if (entry?.walletCurrencyId) {
                              const cfg = getCurrencyById(entry.walletCurrencyId)
                              const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
                              return (
                                <Fragment key={entry.id ?? `bagpub-${c.id}-${invIdx}`}>
                                  <tr
                                    className="border-t border-white/10 bg-[#1e2a3d]/40 hover:bg-[#24344d]/35"
                                    style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                                    onDragOver={dragOverPublicBagZone}
                                  >
                                    <td className="py-1 px-4 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48, maxHeight: 48 }}>
                                      —
                                    </td>
                                    <td className="py-1 px-4 text-dnd-gold-light/95 font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                      <span className="block text-[10px] text-dnd-text-muted font-normal leading-tight">钱币</span>
                                      <span className="truncate block max-w-full">{label}</span>
                                    </td>
                                    <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-muted text-xs" style={{ height: 48, maxHeight: 48 }}>
                                      —
                                    </td>
                                    <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-muted text-[11px] border-l border-white/10 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>
                                      公家袋内钱币堆，计入「货币与金库」团队合计；与角色个人钱包无关。数量可在本列修改；改为 0 将移除该币种堆叠。
                                    </td>
                                    <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                      <div className="flex justify-center max-w-[5.5rem] mx-auto" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                        <NumberStepper
                                          value={entry.walletCurrencyId === 'gem_lb' ? Math.max(0, Number(qty) || 0) : Math.max(0, Math.floor(qty))}
                                          onChange={(v) => {
                                            const raw = entry.walletCurrencyId === 'gem_lb' ? Math.max(0, Number(v) || 0) : Math.max(0, Math.floor(Number(v) || 0))
                                            patchPublicBagInventoryItem(c.id, invIdx, { qty: raw })
                                          }}
                                          min={0}
                                          max={999999999}
                                          compact
                                          pill
                                        />
                                      </div>
                                    </td>
                                    <td className="py-1 px-1 border-l border-white/10 align-middle text-center overflow-hidden text-dnd-text-muted text-[10px]" style={{ height: 48, maxHeight: 48 }}>
                                      —
                                    </td>
                                  </tr>
                                </Fragment>
                              )
                            }

                            return (
                              <Fragment key={entry.id ?? `bagpub-${c.id}-${invIdx}`}>
                                <tr
                                  className="border-t border-white/10 hover:bg-[#24344d]/35 cursor-grab active:cursor-grabbing"
                                  style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                                  draggable
                                  onDragOver={dragOverPublicBagZone}
                                  onDragStart={(e) => handlePublicBagDragStart(e, c.id, invIdx)}
                                  onDragEnd={handleDragEnd}
                                  title="拖到下方「团队储物栏」释放以移入仓库"
                                >
                                  <td className="py-1 px-4 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                    <span className="inline-flex justify-center text-dnd-text-muted">
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                  </td>
                                  <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                    <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                                      {displayName(entry)}
                                      {nameExtra}
                                    </span>
                                  </td>
                                  <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                    <div className="flex justify-center" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                      <NumberStepper
                                        value={Number(entry.charge) || 0}
                                        onChange={(v) => patchPublicBagInventoryItem(c.id, invIdx, { charge: v })}
                                        min={0}
                                        compact
                                        pill
                                      />
                                    </div>
                                  </td>
                                  <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-body text-xs min-w-0 overflow-hidden border-l border-white/10 align-middle text-left" style={{ height: 48, maxHeight: 48, overflow: 'hidden' }} title={getEntryBriefFull(entry) || undefined}>
                                    <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                                      <span className="line-clamp-2 text-left inline-block w-full break-words">{getEntryBriefFull(entry) || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                    <div className="flex justify-center" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                      <NumberStepper
                                        value={qty}
                                        onChange={(v) => patchPublicBagInventoryItem(c.id, invIdx, { qty: v })}
                                        min={1}
                                        compact
                                        pill
                                      />
                                    </div>
                                  </td>
                                  <td className="py-1 px-1 border-l border-white/10 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                                    <div className="flex items-center justify-center gap-0.5 min-w-0 max-w-full">
                                      <button
                                        type="button"
                                        onClick={() => openDepositFromPublicBag(c.id, invIdx)}
                                        title="存入角色（目标角色身上背包，非次元袋）"
                                        className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                                      >
                                        <Package size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setBagItemEdit({ charId: c.id, invIdx })}
                                        title="编辑"
                                        className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeBagItemFromCharacter(c.id, invIdx)}
                                        title="删除"
                                        className="p-1 rounded text-dnd-red hover:bg-dnd-red/20 shrink-0"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </Fragment>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="pt-2 border-t border-white/10">
          <div className="mb-2 space-y-1">
            <h4 className="text-dnd-text-muted text-[10px] font-bold uppercase tracking-wider mb-0">团队储物栏（直接存入）</h4>
            <p className="text-dnd-text-muted text-[10px] leading-snug">
              顶部为<strong className="text-dnd-text-body">团队金库账面货币</strong>（「货币与金库」合计含公家次元袋内钱币；增加/减少在上方操作，或<strong className="text-dnd-text-body">将本行拖入公家次元袋</strong>以移入袋内仍计团队金库）。下方为实体物品。栏内拖拽实体行释放在<strong className="text-dnd-text-body">表格任意位置</strong>可移至<strong className="text-dnd-text-body">列表末尾</strong>，末尾同名则合并。
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="inventory-table w-full text-xs" style={{ tableLayout: 'fixed', minWidth: '480px' }}>
              <colgroup>
                <col style={{ width: '1.9%' }} />
                <col style={{ width: '12.38%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '59.52%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '7.14%' }} />
              </colgroup>
              <thead>
                <tr className="bg-[#1b2738]/85 text-dnd-text-muted text-[10px] uppercase tracking-wider" style={{ height: 48, minHeight: 48, maxHeight: 48 }}>
                  <th className="py-0 px-4 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} title="拖拽排序" />
                  <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>名称</th>
                  <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>充能</th>
                  <th className="py-0 px-4 font-semibold min-w-0 border-l border-white/10 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                  <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>数量</th>
                  <th className="py-0 px-4 border-l border-white/10 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} />
                </tr>
              </thead>
              <tbody
                onDragOverCapture={handleDragOver}
                onDrop={handleWarehouseTableDrop}
              >
                {vaultWarehouseRows.map(({ currencyId, qty: vQty }) => {
                  const cfg = getCurrencyById(currencyId)
                  const label = cfg ? getCurrencyDisplayName(cfg) : currencyId
                  const modId = currentModuleId ?? 'default'
                  return (
                    <tr
                      key={`team-vault-${currencyId}`}
                      className="border-t border-white/10 bg-amber-950/20 hover:bg-amber-950/28 cursor-grab active:cursor-grabbing"
                      style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                      draggable
                      title="拖到上方「公家次元袋」卡片：从账面移入袋内，仍计入团队金库合计"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          DND_TEAM_VAULT_CURRENCY_MIME,
                          JSON.stringify({ moduleId: modId, currencyId, qty: vQty }),
                        )
                        e.dataTransfer.setData('text/plain', `dnd-vault-currency:${currencyId}:${vQty}`)
                        e.dataTransfer.effectAllowed = 'copy'
                        e.currentTarget.classList.add('opacity-60')
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove('opacity-60')}
                    >
                      <td className="py-1 px-4 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48, maxHeight: 48 }}>
                        <span className="inline-flex justify-center" title="拖拽">
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                      </td>
                      <td className="py-1 px-4 text-dnd-gold-light/95 font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <span className="block text-[10px] text-dnd-text-muted font-normal leading-tight">团队金库</span>
                        <span className="truncate block max-w-full">{label}</span>
                      </td>
                      <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-muted text-xs" style={{ height: 48, maxHeight: 48 }}>
                        —
                      </td>
                      <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-muted text-[11px] border-l border-white/10 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>
                        账面余额；可在「货币与金库」调整，或拖入公家次元袋（仍计团队金库）。
                      </td>
                      <td className="py-1 px-2 border-l border-white/10 align-middle text-center text-dnd-text-body text-xs tabular-nums" style={{ height: 48, maxHeight: 48 }}>
                        {vQty}
                      </td>
                      <td className="py-1 px-1 border-l border-white/10 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48, maxHeight: 48 }}>
                        —
                      </td>
                    </tr>
                  )
                })}
                {list.length === 0 && vaultWarehouseRows.length === 0 ? (
                  <tr className="border-t border-white/10">
                    <td
                      colSpan={6}
                      className="py-8 px-4 text-center text-dnd-text-muted text-[11px] align-middle border-2 border-dashed border-dnd-gold/20 bg-[#151c28]/25"
                    >
                      团队储物栏暂无物品与金库余额。可在「货币与金库」入账，或从公家次元袋拖入物品。
                    </td>
                  </tr>
                ) : null}
                {list.map((entry, i) => {
                const qty = Math.max(1, Number(entry?.qty) ?? 1)
                return (
                  <Fragment key={i}>
                    <tr
                      className="border-t border-white/10 hover:bg-[#24344d]/35 cursor-grab active:cursor-grabbing"
                      style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      title="拖到本表任意位置松手：移至列表末尾，末尾同名则合并"
                    >
                      <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                        <span className="inline-flex justify-center"><GripVertical className="w-3.5 h-3.5" /></span>
                      </td>
                      <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                          {displayName(entry)}
                          {(() => {
                            const se = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                            const sv = se != null && se.value != null ? Number(se.value) : null
                            if (sv != null && !Number.isNaN(sv) && sv > 0) {
                              return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">{sv}层</span>
                            }
                            if ((Number(entry.magicBonus) || 0) > 0) {
                              return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                            }
                            return null
                          })()}
                        </span>
                      </td>
                      <td className="py-1 px-2 border-l border-white/10 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex justify-center">
                          <NumberStepper
                            value={Number(entry.charge) || 0}
                            onChange={(v) => setCharge(i, v)}
                            min={0}
                            compact
                            pill
                          />
                        </div>
                      </td>
                      <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-body text-xs min-w-0 overflow-hidden border-l border-white/10 align-middle text-left" style={{ height: 48, maxHeight: 48, overflow: 'hidden' }} title={getEntryBriefFull(entry) || undefined}>
                        <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                          <span className="line-clamp-2 text-left inline-block w-full break-words">{getEntryBriefFull(entry) || '—'}</span>
                        </div>
                      </td>
                      <td className="py-1 px-2 border-l border-white/10 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex justify-center">
                          <NumberStepper
                            value={qty}
                            onChange={(v) => setQty(i, v)}
                            min={1}
                            compact
                            pill
                          />
                        </div>
                      </td>
                      <td className="py-1 px-1 border-l border-white/10 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex items-center justify-center gap-0.5 min-w-0 max-w-full">
                          <button type="button" onClick={() => openDeposit(i)} title="存入角色" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0">
                            <Package size={14} />
                          </button>
                          <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
                {list.length > 0 ? (
                  <tr className="border-t border-dashed border-dnd-gold/25 bg-[#151c28]/30">
                    <td colSpan={6} className="py-3 px-3 text-center text-dnd-text-muted text-[10px] align-middle">
                      释放在上方任意实体物品行或本区域 → 移至列表末尾（末尾同名则合并）
                    </td>
                  </tr>
                ) : vaultWarehouseRows.length > 0 ? (
                  <tr className="border-t border-dashed border-white/10 bg-[#151c28]/20">
                    <td colSpan={6} className="py-2.5 px-3 text-center text-dnd-text-muted text-[10px] align-middle">
                      暂无实体物品。货币行为账面金库；可拖入公家次元袋，合计仍见「货币与金库」。
                    </td>
                  </tr>
                ) : null}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* 魔法物品制作工厂 */}
      <section className="mt-8">
        <MagicCraftingPanel />
      </section>

      {/* 存入角色弹窗（样式与背包「存到团队仓库」一致） */}
      {depositContext && depositModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeDepositModal}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存入角色</p>
            {depositContext.type === 'bag' ? (
              <p className="text-dnd-text-muted text-[10px] mb-1">
                来源：{getCharacter(depositContext.sourceCharId)?.name || '未命名'} 的公家次元袋 → 目标角色身上背包
              </p>
            ) : null}
            <p className="text-dnd-text-muted text-xs mb-2">当前：{displayName(depositModalEntry)} × {depositModalEntry.qty}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-dnd-text-muted text-xs shrink-0">选择角色</label>
                <select
                  value={depositCharId}
                  onChange={(e) => setDepositCharId(e.target.value)}
                  className={inputClass + ' h-10 w-full mt-1'}
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const maxDepositQty = Math.max(1, Number(depositModalEntry?.qty) ?? 1)
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-10 shrink-0 text-dnd-text-muted text-xs">数量</span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="max-w-[min(100%,11rem)] w-full shrink-0 min-w-0">
                        <NumberStepper
                          value={depositQty}
                          min={1}
                          max={maxDepositQty}
                          onChange={(v) => setDepositQty(v)}
                          compact
                        />
                      </div>
                      <span className="shrink-0 self-center font-mono text-sm tabular-nums leading-none text-dnd-text-muted whitespace-nowrap">
                        / {maxDepositQty}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeDepositModal} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button type="button" onClick={confirmDeposit} disabled={!depositCharId || isDepositing} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">{isDepositing ? '存入中...' : '确认存入'}</button>
            </div>
          </div>
        </div>
      )}
      {transferHint && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="pointer-events-auto rounded-lg border border-dnd-gold/40 bg-gray-900/95 px-4 py-3 shadow-xl max-w-sm mx-4">
            <p className="text-dnd-gold-light text-sm font-medium">{transferHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
