import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { CLASS_LIST, getClassData, isFanxingClass } from '../data/classDatabase'
import { FEATS_BY_CATEGORY } from '../data/feats'
import { MARTIAL_TECHNIQUES } from '../data/martialTechniques'
import { ABILITY_NAMES_ZH } from '../data/buffTypes'

const SPELL_TYPE_LABELS = {
  full: '全施法',
  half: '半施法',
  third: '三分之一施法',
  pact: '契约施法',
}

export default function HouseRules() {
  const [expanded, setExpanded] = useState(null)
  const [expandedMartial, setExpandedMartial] = useState(null)
  const [expandedFeatIds, setExpandedFeatIds] = useState(() => new Set())

  const toggleFeat = (id) => {
    setExpandedFeatIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sectionKeys = ['房规与模组', '职业库', '专长表', '武技库']
  const [expandedSections, setExpandedSections] = useState(() => new Set(sectionKeys))
  const [expandedFeatCategories, setExpandedFeatCategories] = useState(
    () => new Set(Object.keys(FEATS_BY_CATEGORY))
  )
  const [expandedSubclasses, setExpandedSubclasses] = useState(() => new Set())

  const toggleSubclass = (className, subName) => {
    const key = `${className}|${subName}`
    setExpandedSubclasses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleFeatCategory = (category) => {
    setExpandedFeatCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        繁星特色（房规/模组）
      </h1>

      {/* 房规与模组说明 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('房规与模组')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('房规与模组') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">房规与模组</h2>
        </button>
        {expandedSections.has('房规与模组') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3">富文本房规与模组说明，开发中。</p>
          </div>
        )}
      </div>

      {/* 职业库：供角色卡施法等级、生命骰与职业特性调用 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('职业库')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('职业库') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">职业库</h2>
          <span className="text-dnd-text-muted text-sm">{CLASS_LIST.length} 个职业</span>
        </button>
        {expandedSections.has('职业库') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              职业数据供角色卡施法等级、生命骰与职业特性调用使用。
            </p>
            <div className="space-y-2">
          {CLASS_LIST.map((className) => {
            const data = getClassData(className)
            if (!data) return null
            const isOpen = expanded === className
            const spell = data.spellcasting
            const spellLabel = spell ? SPELL_TYPE_LABELS[spell.type] || spell.type : null
            const abilityLabel = spell?.ability ? ABILITY_NAMES_ZH[spell.ability] : null

            return (
              <div
                key={className}
                className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : className)}
                  className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                  <span className="font-semibold">{className}</span>
                  {isFanxingClass(className) && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/90 text-black uppercase tracking-wider">
                      繁星特色
                    </span>
                  )}
                  <span className="text-dnd-text-muted text-sm">
                    d{data.hitDice} 生命骰
                    {spellLabel && ` · ${spellLabel}${abilityLabel ? `（${abilityLabel}）` : ''}`}
                    {data.features?.length ? ` · ${data.features.length} 项特性` : ''}
                  </span>
                </button>
                {isOpen && data && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/10">
                    {data.flavor && (
                      <p className="text-dnd-text-muted text-xs mt-3 mb-2 italic">{data.flavor}</p>
                    )}
                    {data.requirements && (
                      <p className="text-dnd-text-muted text-xs mt-3 mb-2">
                        <span className="text-dnd-gold-light font-bold">进阶要求：</span>
                        {data.requirements}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-dnd-text-muted mt-3 mb-3">
                      <span>生命骰</span>
                      <span className="text-white font-mono">d{data.hitDice}</span>
                      {spell && (
                        <>
                          <span>施法</span>
                          <span className="text-white">{spellLabel}{abilityLabel ? `（${abilityLabel}）` : spell.ability === null ? '（继承进阶前）' : ''}</span>
                        </>
                      )}
                      {data.saveProficiencies?.length > 0 && (
                        <>
                          <span>豁免熟练</span>
                          <span className="text-white">{data.saveProficiencies.map((k) => ABILITY_NAMES_ZH[k] || k).join('、')}</span>
                        </>
                      )}
                    </div>
                    {data.features?.length > 0 && (
                      <div>
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">职业特性</p>
                        <ul className="space-y-2">
                          {data.features.map((f) => (
                            <li key={f.id} className="text-sm">
                              <span className="font-medium text-white">{f.name}</span>
                              <span className="text-dnd-text-muted text-xs ml-2">（{f.level} 级）</span>
                              <p className="text-dnd-text-muted text-xs mt-0.5">{f.description}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.subclasses && Object.keys(data.subclasses).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-3">子职</p>
                        <div className="space-y-2">
                          {Object.entries(data.subclasses).map(([subName, sub]) => {
                            const subKey = `${className}|${subName}`
                            const isSubOpen = expandedSubclasses.has(subKey)
                            const featureCount = sub.features?.length ?? 0
                            return (
                              <div key={subName} className="rounded-lg border border-white/10 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleSubclass(className, subName)}
                                  className="w-full flex items-center gap-2 py-2.5 px-3 text-left text-white hover:bg-white/5 transition-colors"
                                >
                                  {isSubOpen ? (
                                    <ChevronDown className="w-4 h-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 shrink-0" />
                                  )}
                                  <span className="font-semibold text-sm">{className} · {subName}</span>
                                  {featureCount > 0 && (
                                    <span className="text-dnd-text-muted text-xs">{featureCount} 项特性</span>
                                  )}
                                </button>
                                {isSubOpen && (
                                  <div className="px-3 pb-3 pt-0 border-t border-white/10">
                                    {sub.flavor && <p className="text-dnd-text-muted text-xs italic mt-2 mb-2">{sub.flavor}</p>}
                                    {sub.features?.length > 0 ? (
                                      <ul className="space-y-2">
                                        {sub.features.map((f) => (
                                          <li key={f.id} className="text-sm">
                                            <span className="font-medium text-white">{f.name}</span>
                                            <span className="text-dnd-text-muted text-xs ml-2">（{f.level} 级）</span>
                                            <p className="text-dnd-text-muted text-xs mt-0.5">{f.description}</p>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-dnd-text-muted text-xs mt-2">暂无子职特性数据。</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
            </div>
          </div>
        )}
      </div>

      {/* 专长表：与职业库平行，分栏展示 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('专长表')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('专长表') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">专长表</h2>
          <span className="text-dnd-text-muted text-sm">
            {Object.values(FEATS_BY_CATEGORY).flat().length} 项专长
          </span>
        </button>
        {expandedSections.has('专长表') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              专长数据供角色卡与房规查阅使用。
            </p>
            {Object.keys(FEATS_BY_CATEGORY).length === 0 ? (
          <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
            <p className="text-dnd-text-muted text-sm">暂无专长条目，后续可在此处添加。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(FEATS_BY_CATEGORY).map(([category, list]) => {
              const isCategoryOpen = expandedFeatCategories.has(category)
              return (
                <div key={category} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFeatCategory(category)}
                    className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                  >
                    {isCategoryOpen ? (
                      <ChevronDown className="w-5 h-5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 shrink-0" />
                    )}
                    <span className="font-semibold text-dnd-gold-light/90">{category}</span>
                    <span className="text-dnd-text-muted text-sm">{list.length} 项专长</span>
                  </button>
                  {isCategoryOpen && (
                    <div className="px-4 pb-4 pt-0 border-t border-white/10">
                      <div className="space-y-2 pt-3">
                        {list.map((f) => {
                          const isOpen = expandedFeatIds.has(f.id)
                    return (
                      <div key={f.id} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleFeat(f.id)}
                          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-5 h-5 shrink-0" />
                          ) : (
                            <ChevronRight className="w-5 h-5 shrink-0" />
                          )}
                          <span className="font-semibold">{f.name}</span>
                          {f.nameEn && (
                            <span className="text-dnd-text-muted text-xs font-normal">{f.nameEn}</span>
                          )}
                          {f.source && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-dnd-text-muted border border-white/20">
                              {f.source}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-0 border-t border-white/10">
                            {f.prerequisite && (
                              <p className="text-dnd-text-muted text-xs mt-3 mb-2">
                                <span className="text-dnd-gold-light font-medium">前提：</span>
                                {f.prerequisite}
                              </p>
                            )}
                            <p className="text-dnd-text-muted text-sm whitespace-pre-line mt-3">{f.description}</p>
                            {f.table && (
                              <div className="mt-3 overflow-x-auto">
                                <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">
                                  快速制作
                                </p>
                                <table className="w-full text-xs text-dnd-text-muted border border-white/10 rounded-lg overflow-hidden">
                                  <thead>
                                    <tr className="bg-white/5">
                                      <th className="text-left py-2 px-3 font-semibold text-dnd-gold-light/90">
                                        工匠工具
                                      </th>
                                      <th className="text-left py-2 px-3 font-semibold text-dnd-gold-light/90">
                                        可制造的装备
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.table.map((row, i) => (
                                      <tr key={i} className="border-t border-white/10">
                                        <td className="py-1.5 px-3">{row.tools}</td>
                                        <td className="py-1.5 px-3">{row.items}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                        )}
                      </div>
                    )}
                  </div>
                )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </div>
        )}
      </div>

      {/* 武技库：与职业库平行，供战斗/专长等调用 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('武技库')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('武技库') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">武技库 · 繁星特色</h2>
          <span className="text-dnd-text-muted text-sm">{MARTIAL_TECHNIQUES.length} 项武技</span>
        </button>
        {expandedSections.has('武技库') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              武技数据供战斗、专长等调用使用。
            </p>
            {MARTIAL_TECHNIQUES.length === 0 ? (
          <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
            <p className="text-dnd-text-muted text-sm">暂无武技条目，后续可在此处添加。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(new Set(MARTIAL_TECHNIQUES.map((t) => t.style))).map((style) => {
              const count = MARTIAL_TECHNIQUES.filter((t) => t.style === style).length
              const isOpen = expandedMartial === style
              return (
                <div key={style} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedMartial(isOpen ? null : style)}
                    className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                    <span className="font-semibold">{style}</span>
                    <span className="text-dnd-text-muted text-sm">{count} 项武技</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-0 border-t border-white/10">
                      <ul className="divide-y divide-white/10 pt-3">
                        {MARTIAL_TECHNIQUES.filter((t) => t.style === style).map((t) => (
                          <li key={t.id} className="py-3 first:pt-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-medium text-white">{t.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">{t.type}</span>
                            </div>
                            <div className="text-dnd-text-muted text-xs flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                              {t.level != null && <span>等级：{t.level}</span>}
                              {t.requirement && <span>前提：{t.requirement}</span>}
                              <span>动作：{t.action}</span>
                              <span>距离：{t.range}</span>
                              <span>目标：{t.target}</span>
                              {t.duration && <span>持续：{t.duration}</span>}
                            </div>
                            <p className="text-dnd-text-muted text-sm">{t.description}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  )
}
