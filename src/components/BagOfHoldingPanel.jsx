import { useMemo, useState, useEffect } from 'react'
import { Package, Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { getBagOfHoldingSelfWeightLb } from '../lib/encumbrance'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import { entryBelongsToBagModule, MAX_BAG_OF_HOLDING_TOTAL, compareBagInventoryDisplayOrder } from '../lib/bagOfHoldingModules'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { NumberStepper } from './BuffForm'
import { inputClass } from '../lib/inputStyles'

function collapseStorageKey(characterId) {
  return characterId ? `dnd-bag-panel-collapsed-${characterId}` : 'dnd-bag-panel-collapsed'
}

/**
 * 次元袋（单模块）：模块内「次元袋个数」+ 私人/公家 + 与背包同结构的袋内表；默认可 0 模块（无存档次元袋）
 */
export default function BagOfHoldingPanel({
  bagModules,
  onAddModule,
  onRemoveModule,
  onSetModuleBagCount,
  onSetModuleVisibility,
  inventory,
  onMoveToBag,
  onMoveCurrencyToBag,
  canEdit,
  invDisplayName,
  getEntryWeight,
  getEntryBriefFull,
  /** 袋内行内编辑：(背包 inventory 下标, { qty?, charge? }) */
  onPatchBagItem,
  /** 用于折叠状态持久化 */
  characterId,
}) {
  const modules = Array.isArray(bagModules) ? bagModules : []
  const mod = modules[0]
  const totalBags = mod ? mod.bagCount : 0
  const selfLb = getBagOfHoldingSelfWeightLb(totalBags)

  const [panelCollapsed, setPanelCollapsed] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(collapseStorageKey(characterId))
      setPanelCollapsed(v === '1')
    } catch {
      setPanelCollapsed(false)
    }
  }, [characterId])

  const togglePanelCollapsed = () => {
    setPanelCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(collapseStorageKey(characterId), next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const bagRows = useMemo(() => {
    if (!mod) return []
    const rows = inventory
      .map((entry, i) => ({ entry, i }))
      .filter(({ entry }) => entryBelongsToBagModule(entry, mod, modules))
    rows.sort((a, b) => compareBagInventoryDisplayOrder(a.entry, a.i, b.entry, b.i))
    return rows
  }, [inventory, mod, modules])

  /** 本模块袋内特品与钱币堆叠的合计重量（不含次元袋自重） */
  const bagContentsTotalLb = useMemo(() => {
    let s = 0
    for (const { entry } of bagRows) {
      const qty = Math.max(1, Number(entry?.qty) ?? 1)
      const unit = typeof getEntryWeight === 'function' ? getEntryWeight(entry) : 0
      s += unit * qty
    }
    return Math.round(s * 100) / 100
  }, [bagRows, getEntryWeight])

  const handleDragStart = (e, globalIndex) => {
    e.dataTransfer.setData('text/dnd-character-inv', String(globalIndex))
    e.dataTransfer.setData('text/dnd-from-bag', '1')
    e.dataTransfer.setData('text/plain', `bag-inv:${globalIndex}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-60')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-60')
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copyMove'
  }

  const handleDropZone = (e) => {
    e.preventDefault()
    if (!canEdit || !mod || totalBags <= 0) return
    const wc = e.dataTransfer.getData('text/dnd-wallet-currency')
    const wcQty = Number(e.dataTransfer.getData('text/dnd-wallet-currency-qty'))
    if (wc && onMoveCurrencyToBag) {
      onMoveCurrencyToBag(wc, mod.id, Number.isFinite(wcQty) ? wcQty : undefined)
      return
    }
    if (!onMoveToBag) return
    let fromIndex = parseInt(e.dataTransfer.getData('text/dnd-character-inv'), 10)
    if (Number.isNaN(fromIndex)) {
      const plain = e.dataTransfer.getData('text/plain')
      const m = /^inv:(\d+)$/.exec(plain)
      if (m) fromIndex = parseInt(m[1], 10)
    }
    if (Number.isNaN(fromIndex)) return
    onMoveToBag(fromIndex, mod.id)
  }

  const bumpBagCount = () => {
    if (!mod || !onSetModuleBagCount || !canEdit) return
    const next = Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.max(0, Number(mod.bagCount) || 0) + 1)
    onSetModuleBagCount(mod.id, next)
  }

  const iconBtn =
    'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-gray-500/70 bg-gray-800/90 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
  const removeBagBtn =
    'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-dnd-red/60 bg-gray-800/90 text-dnd-red hover:bg-dnd-red/20 hover:border-dnd-red/80 disabled:opacity-40 disabled:cursor-not-allowed'

  const renderNameExtras = (entry) => {
    const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((x) => x.effectType === 'ac_cap_stone_layer') : null
    const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
    if (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) {
      return (
        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
          {stoneVal}层
        </span>
      )
    }
    if ((Number(entry.magicBonus) || 0) > 0) {
      return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
    }
    return null
  }

  const tableColSpan = canEdit ? 6 : 4
  const patchBag = typeof onPatchBagItem === 'function' ? onPatchBagItem : null

  return (
    <div className="rounded-xl border border-dnd-gold/40 bg-[#1b2738]/80 overflow-hidden flex flex-col min-h-0 min-w-0 h-full">
      <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider px-2 py-1.5 border-b border-white/10 flex items-center gap-2 min-w-0">
        <span className="flex items-center gap-1 min-w-0 flex-1 truncate">
          <Package className="w-3.5 h-3.5 shrink-0" aria-hidden />
          次元袋
        </span>
        {mod && totalBags > 0 ? (
          <span
            className="text-dnd-text-muted text-[10px] tabular-nums shrink-0"
            title="袋内物品合计重量（不含次元袋自重）"
          >
            合计 <span className="text-dnd-gold-light/95 font-semibold">{bagContentsTotalLb}</span> lb
          </span>
        ) : null}
        <button
          type="button"
          onClick={togglePanelCollapsed}
          className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg border border-white/15 bg-[#151c28]/80 text-gray-300 hover:bg-white/10 hover:text-white"
          title={panelCollapsed ? '展开' : '折叠'}
          aria-expanded={!panelCollapsed}
          aria-label={panelCollapsed ? '展开次元袋' : '折叠次元袋'}
        >
          {panelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </h3>
      {!panelCollapsed && (
        <div className="p-2 space-y-2 flex-1 min-h-0 flex flex-col text-xs">
          {!mod ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-dnd-text-muted text-[11px] leading-relaxed flex-1 min-w-0">
                当前无存档次元袋。点击右侧 <span className="text-dnd-text-body">+</span>{' '}
                添加模块（可在此模块下设多个次元袋数量，共用一个袋内空间）。
              </p>
              {canEdit && onAddModule && (
                <button type="button" onClick={onAddModule} className={iconBtn} title="添加次元袋模块" aria-label="添加次元袋模块">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-white/10 bg-[#151c28]/40 p-2 space-y-2">
                <div className="text-dnd-text-muted text-[10px] font-semibold uppercase tracking-wide">模块 1</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[7rem] space-y-1">
                    <span className="block text-dnd-text-muted text-[11px] font-medium" id="bag-count-label">
                      次元袋个数
                    </span>
                    <div className="h-7 w-full max-w-full" aria-labelledby="bag-count-label">
                      <NumberStepper
                        value={mod.bagCount}
                        onChange={(v) => onSetModuleBagCount?.(mod.id, v)}
                        min={0}
                        max={MAX_BAG_OF_HOLDING_TOTAL}
                        compact
                        disabled={!canEdit || !onSetModuleBagCount}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1 w-[5.5rem]">
                    <span className="text-dnd-text-muted text-[11px] font-medium text-right w-full whitespace-nowrap" id="bag-vis-label">
                      可见性
                    </span>
                    <div className="h-7 w-full">
                      <select
                        aria-labelledby="bag-vis-label"
                        disabled={!canEdit || !onSetModuleVisibility}
                        value={normalizeBagOfHoldingVisibility(mod.visibility)}
                        onChange={(e) =>
                          onSetModuleVisibility?.(mod.id, e.target.value === 'public' ? 'public' : 'private')
                        }
                        title="私人：团队仓库不列出此袋内物品。公家（新建默认）：全体玩家可在团队仓库查看袋内并编辑数量/充能。"
                        className={`${inputClass} box-border !h-7 w-full min-h-0 max-h-7 py-0 pl-1.5 pr-5 text-[11px] text-right leading-none`}
                      >
                        <option value="public">公家（团队可见）</option>
                        <option value="private">私人</option>
                      </select>
                    </div>
                  </div>
                  {canEdit && onSetModuleBagCount && (
                    <button
                      type="button"
                      onClick={bumpBagCount}
                      disabled={!canEdit || !mod || totalBags >= MAX_BAG_OF_HOLDING_TOTAL}
                      className={`${iconBtn} self-end`}
                      title="次元袋个数 +1"
                      aria-label="次元袋个数加一"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                  {canEdit && onRemoveModule && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            '确定要删除次元袋吗？\n\n删除后袋内物品会回到背包（身上）物品栏；此操作不可撤销。',
                          )
                        ) {
                          return
                        }
                        onRemoveModule(0)
                      }}
                      className={`${removeBagBtn} self-end`}
                      title="删除次元袋模块"
                      aria-label="删除次元袋模块"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
                {totalBags <= 0 ? (
                  <p className="text-dnd-text-muted text-[11px]">将「次元袋个数」调到至少 1 后出现袋内拖放区。</p>
                ) : (
                  <div
                    onDragOver={canEdit ? handleDragOver : undefined}
                    onDrop={canEdit ? handleDropZone : undefined}
                    className={`rounded-md border-2 border-dashed border-dnd-gold/30 bg-[#151c28]/50 flex flex-col min-h-[88px] max-h-[min(32vh,18rem)] overflow-hidden ${canEdit ? 'hover:border-dnd-gold/50' : ''}`}
                    title={canEdit ? '从相邻背包拖入身上物品；从个人持有拖货币（⋮ 柄）入袋' : ''}
                  >
                    <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                      <table className="inventory-table w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '480px' }}>
                        <colgroup>
                          {canEdit && <col style={{ width: '1.9%' }} />}
                          <col style={{ width: canEdit ? '12.38%' : '14.29%' }} />
                          <col style={{ width: '9.52%' }} />
                          <col style={{ width: canEdit ? '59.52%' : '61.9%' }} />
                          <col style={{ width: '9.52%' }} />
                          {canEdit && <col style={{ width: '7.14%' }} />}
                        </colgroup>
                        <thead>
                          <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider" style={{ height: 40, minHeight: 40 }}>
                            {canEdit && (
                              <th className="py-0 px-2 align-middle text-center whitespace-nowrap" style={{ height: 40 }}>
                                —
                              </th>
                            )}
                            <th className="py-0 px-2 font-semibold min-w-0 align-middle text-left whitespace-nowrap" style={{ height: 40 }}>
                              名称
                            </th>
                            <th className="py-0 px-2 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 40 }}>
                              充能
                            </th>
                            <th className="py-0 px-2 font-semibold min-w-0 border-l border-gray-600 align-middle text-left whitespace-nowrap" style={{ height: 40 }}>
                              简要介绍
                            </th>
                            <th className="py-0 px-2 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 40 }}>
                              数量
                            </th>
                            {canEdit && (
                              <th className="py-0 px-2 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 40 }}>
                                —
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {bagRows.length === 0 ? (
                            <tr className="border-t border-gray-700/80">
                              <td
                                colSpan={tableColSpan}
                                className="py-4 px-3 text-center text-gray-500 text-[11px] align-middle"
                                style={{ minHeight: 72 }}
                              >
                                {canEdit ? '暂无。可拖入背包内物品，或将个人持有中货币的 ⋮ 柄拖入此处。' : '—'}
                              </td>
                            </tr>
                          ) : (
                            bagRows.map(({ entry, i }) => {
                              const qty = Math.max(1, Number(entry?.qty) ?? 1)
                              const brief = getEntryBriefFull ? getEntryBriefFull(entry) : ''

                              if (entry?.walletCurrencyId) {
                                const cfg = getCurrencyById(entry.walletCurrencyId)
                                const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
                                return (
                                  <tr
                                    key={entry.id ?? `bag-${mod.id}-wc-${i}`}
                                    className={`border-t border-gray-700/80 bg-[#1e2a3d]/50 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                                    draggable={!!canEdit}
                                    onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                                    onDragEnd={canEdit ? handleDragEnd : undefined}
                                  >
                                    {canEdit && (
                                      <td className="py-1 px-2 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48 }}>
                                        <GripVertical className="w-3.5 h-3.5 inline opacity-50" />
                                      </td>
                                    )}
                                    <td className="py-1 px-2 text-dnd-gold-light/95 font-medium align-middle text-left overflow-hidden" style={{ height: 48 }}>
                                      <span className="block text-[10px] text-dnd-text-muted font-normal leading-tight">钱币</span>
                                      <span className="truncate block max-w-full">{label}</span>
                                    </td>
                                    <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-xs" style={{ height: 48 }}>
                                      —
                                    </td>
                                    <td className="inventory-table-cell-brief py-1 px-2 text-dnd-text-muted text-[11px] border-l border-gray-600 align-middle text-left" style={{ height: 48 }}>
                                      袋内钱币堆；拖回背包表合并至钱包。
                                    </td>
                                    <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48 }}>
                                      {patchBag && canEdit ? (
                                        <div className="flex justify-center max-w-[5.5rem] mx-auto" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                          <NumberStepper
                                            value={entry.walletCurrencyId === 'gem_lb' ? Math.max(0, Number(qty) || 0) : Math.max(0, Math.floor(qty))}
                                            onChange={(v) => {
                                              const raw =
                                                entry.walletCurrencyId === 'gem_lb'
                                                  ? Math.max(0, Number(v) || 0)
                                                  : Math.max(0, Math.floor(Number(v) || 0))
                                              patchBag(i, { qty: raw })
                                            }}
                                            min={0}
                                            max={999999999}
                                            compact
                                            pill
                                          />
                                        </div>
                                      ) : (
                                        qty
                                      )}
                                    </td>
                                    {canEdit && (
                                      <td className="py-1 px-1 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48 }}>
                                        —
                                      </td>
                                    )}
                                  </tr>
                                )
                              }

                              return (
                                <tr
                                  key={entry.id ?? `bag-${mod.id}-${i}`}
                                  draggable={!!canEdit}
                                  onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                                  onDragEnd={canEdit ? handleDragEnd : undefined}
                                  className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                  style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                                  title={brief || undefined}
                                >
                                  {canEdit && (
                                    <td className="py-1 px-2 align-middle text-center overflow-hidden" style={{ height: 48 }} title="拖回左侧背包">
                                      <GripVertical className="w-3.5 h-3.5 inline text-dnd-text-muted" />
                                    </td>
                                  )}
                                  <td className="py-1 px-2 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48 }}>
                                    <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                                      {invDisplayName(entry)}
                                      {renderNameExtras(entry)}
                                    </span>
                                  </td>
                                  <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48 }}>
                                    {canEdit && patchBag ? (
                                      <div className="flex justify-center" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                        <NumberStepper
                                          value={Number(entry.charge) || 0}
                                          onChange={(v) => patchBag(i, { charge: v })}
                                          min={0}
                                          compact
                                          pill
                                        />
                                      </div>
                                    ) : (Number(entry.charge) || 0) > 0 ? (
                                      entry.charge
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="inventory-table-cell-brief py-1 px-2 text-dnd-text-body text-[11px] min-w-0 overflow-hidden border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>
                                    <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                                      <span className="line-clamp-2 text-left inline-block w-full break-words">{brief || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-body text-xs tabular-nums overflow-hidden" style={{ height: 48 }}>
                                    {canEdit && patchBag ? (
                                      <div className="flex justify-center" onMouseDown={(e) => e.stopPropagation()} role="presentation">
                                        <NumberStepper
                                          value={qty}
                                          onChange={(v) => patchBag(i, { qty: v })}
                                          min={1}
                                          compact
                                          pill
                                        />
                                      </div>
                                    ) : (
                                      qty
                                    )}
                                  </td>
                                  {canEdit && (
                                    <td className="py-1 px-1 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48 }}>
                                      —
                                    </td>
                                  )}
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-dnd-text-muted leading-snug text-[11px] border-t border-white/10 pt-2">
                负重只算背包、钱币与本模块次元袋自重（约{' '}
                <span className="text-dnd-gold-light tabular-nums">{selfLb}</span> lb），不提高负重上限；袋内物品不计入背负。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
