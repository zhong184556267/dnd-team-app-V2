import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Package, ClipboardPaste, BookOpen, Swords, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import {
  ITEM_DATABASE,
  ITEM_TYPES,
  getCustomItems,
  getItemDisplayName,
  addCustomItem,
  updateCustomItem,
  removeCustomItem,
} from '../data/itemDatabase'
import {
  getCustomFeats,
  addCustomFeat,
  updateCustomFeat,
  removeCustomFeat,
} from '../data/feats'
import {
  getCustomClasses,
  addCustomClass,
  removeCustomClass,
} from '../data/classDatabase'
import { parsePasteText } from '../lib/pasteParser'
import { inputClass, textareaClass } from '../lib/inputStyles'

/** 表单类型选项与 ITEM_TYPES 一致 */
const TYPE_OPTIONS_FOR_FORM = ITEM_TYPES

const SUBTYPE_BY_TYPE = {
  近战武器: ['近战'],
  远程武器: ['远程'],
  盔甲: ['轻甲', '中甲', '重甲', '盾牌'],
  载具与坐骑: ['坐骑与其他动物', '鞍具挽具与陆运载具', '空中与水上载具'],
  工具: ['工匠工具', '工具包与套组', '赌具', '乐器'],
  弹药: ['箭矢', '弩矢', '枪械子弹', '投石索子弹', '吹矢', '容器'],
  饰品: ['戒指', '项链', '手镯', '耳环', '护身符', '其他'],
  冒险装备: ['消耗品', '容器', '套组', '照明与燃料', '书写与记录', '其他'],
  储物: ['次元袋', '秘法箱'],
}

const ITEM_FIELDS = [
  { key: '类别', label: '类别/名称', required: true, placeholder: '如：长剑' },
  { key: '名称', label: '自定义名称（可选）', placeholder: '留空则显示类别' },
  { key: '攻击', label: '伤害', placeholder: '如：1d8 挥砍' },
  { key: '附注', label: '词条', placeholder: '如：灵巧、轻型、投掷（射程 20/60）' },
  { key: '精通', label: '精通', placeholder: '如：缓速、迅击、侵扰、推离、削弱、失衡、擦掠、横扫' },
  { key: '伤害', label: '伤害类型', placeholder: '挥砍/穿刺/钝击' },
  { key: '重量', label: '重量', placeholder: '如：3磅' },
  { key: '价格', label: '价格', placeholder: '如：15 GP' },
  { key: '详细介绍', label: '详细介绍', placeholder: '多行文本', textarea: true },
]

function ItemForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    类型: '近战武器',
    子类型: '',
    类别: '',
    名称: '',
    攻击: '',
    附注: '',
    精通: '',
    伤害: '',
    重量: '',
    价格: '',
    详细介绍: '',
    ...initial,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(form)
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">类型（子目录）<span className="text-dnd-red ml-0.5">*</span></label>
        <select
          value={form.类型 && TYPE_OPTIONS_FOR_FORM.includes(form.类型) ? form.类型 : '近战武器'}
          onChange={(e) => update('类型', e.target.value)}
          className={inputClass}
        >
          {TYPE_OPTIONS_FOR_FORM.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {SUBTYPE_BY_TYPE[form.类型] && (
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">子类型（选填，便于在物品选择器里归类）</label>
          <select
            value={form.子类型 ?? ''}
            onChange={(e) => update('子类型', e.target.value)}
            className={inputClass}
          >
            <option value="">— 不设子类型 —</option>
            {SUBTYPE_BY_TYPE[form.类型].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      {ITEM_FIELDS.map(({ key, label, required, placeholder, textarea }) => (
        <div key={key}>
          <label className="block text-dnd-text-muted text-xs mb-1">
            {label}
            {required && <span className="text-dnd-red ml-0.5">*</span>}
          </label>
          {textarea ? (
            <textarea
              value={form[key] ?? ''}
              onChange={(e) => update(key, e.target.value)}
              placeholder={placeholder}
              rows={2}
              className={textareaClass}
            />
          ) : (
            <input
              type="text"
              value={form[key] ?? ''}
              onChange={(e) => update(key, e.target.value)}
              placeholder={placeholder}
              className={inputClass}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm"
        >
          保存
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
          >
            取消
          </button>
        )}
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// 粘贴录入通用组件
// ─────────────────────────────────────────────────────────────

function PasteImporter({ kind, label, icon: Icon, placeholder, onSave, renderPreview }) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [saved, setSaved] = useState(false)

  const handleParse = () => {
    const result = parsePasteText(kind, text)
    setParsed(result)
    setSaved(false)
  }

  const handleSave = () => {
    if (!parsed || parsed.errors.length > 0) return
    onSave(parsed.data)
    setText('')
    setParsed(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    setText('')
    setParsed(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">
          {label}：粘贴文本后点击「解析」
        </label>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null) }}
          placeholder={placeholder}
          rows={8}
          className={textareaClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleParse}
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-lg bg-dnd-gold/80 hover:bg-dnd-gold text-white text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          解析
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
        >
          清空
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-1.5 text-green-400 text-xs">
          <CheckCircle2 className="w-4 h-4" />
          已保存
        </div>
      )}

      {parsed && (
        <div className="rounded-lg border border-white/10 bg-[#141f2e]/60 p-3 space-y-2">
          {/* 错误 */}
          {parsed.errors.length > 0 && (
            <div className="space-y-1">
              {parsed.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5 text-red-400 text-xs">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
          {/* 警告 */}
          {parsed.warnings.length > 0 && (
            <div className="space-y-1">
              {parsed.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-yellow-400 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
          {/* 预览 */}
          {parsed.errors.length === 0 && renderPreview(parsed.data)}
          {/* 保存按钮 */}
          {parsed.errors.length === 0 && (
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 rounded-lg bg-dnd-red/90 hover:bg-dnd-red text-white text-xs font-medium"
            >
              确认保存
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 各类型预览渲染
// ─────────────────────────────────────────────────────────────

function ItemPreview({ data }) {
  const fields = [
    { k: '类型', l: '类型' },
    { k: '子类型', l: '子类型' },
    { k: '类别', l: '名称/类别' },
    { k: '名称', l: '自定义名' },
    { k: '攻击', l: '伤害骰' },
    { k: '伤害', l: '伤害类型' },
    { k: '附注', l: '词条' },
    { k: '精通', l: '精通' },
    { k: '重量', l: '重量' },
    { k: '价格', l: '价格' },
  ]
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {fields.map(({ k, l }) => {
          const v = data[k]
          return (
            <div key={k} className="flex items-center gap-1">
              <span className="text-dnd-text-muted">{l}:</span>
              <span className={v ? 'text-green-400' : 'text-gray-600'}>
                {v || '—'}
              </span>
            </div>
          )
        })}
      </div>
      {data.详细介绍 && (
        <div className="text-xs text-gray-300 mt-1 line-clamp-2">
          <span className="text-dnd-text-muted">介绍:</span> {data.详细介绍}
        </div>
      )}
    </div>
  )
}

function FeatPreview({ data }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-dnd-text-muted">名称:</span>
        <span className="text-green-400">{data.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-dnd-text-muted">分类:</span>
        <span className="text-green-400">{data.category}</span>
      </div>
      {data.prerequisite && (
        <div className="flex items-center gap-1">
          <span className="text-dnd-text-muted">先决:</span>
          <span className="text-green-400">{data.prerequisite}</span>
        </div>
      )}
      <div>
        <span className="text-dnd-text-muted">描述:</span>
        <p className="text-gray-300 mt-0.5 line-clamp-3 whitespace-pre-line">{data.description}</p>
      </div>
    </div>
  )
}

function ClassPreview({ data }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-dnd-text-muted">名称:</span>
        <span className="text-green-400">{data.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-dnd-text-muted">生命骰:</span>
        <span className="text-green-400">d{data.hitDice}</span>
      </div>
      {data.saveProficiencies?.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-dnd-text-muted">豁免:</span>
          <span className="text-green-400">{data.saveProficiencies.join('、')}</span>
        </div>
      )}
      {data.armorProficiencies?.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-dnd-text-muted">护甲:</span>
          <span className="text-green-400">{data.armorProficiencies.join('、')}</span>
        </div>
      )}
      {data.weaponProficiencies?.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-dnd-text-muted">武器:</span>
          <span className="text-green-400">{data.weaponProficiencies.join('、')}</span>
        </div>
      )}
      {data.requirements && (
        <div className="flex items-center gap-1">
          <span className="text-dnd-text-muted">先决:</span>
          <span className="text-green-400">{data.requirements}</span>
        </div>
      )}
      <div>
        <span className="text-dnd-text-muted">特性 ({data.features.length}):</span>
        <div className="mt-0.5 space-y-0.5">
          {data.features.slice(0, 6).map((f, i) => (
            <div key={i} className="text-gray-300">
              Lv{f.level} · {f.name}
            </div>
          ))}
          {data.features.length > 6 && (
            <div className="text-dnd-text-muted">… 共 {data.features.length} 项</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DataMaintain() {
  const [customItems, setCustomItems] = useState([])
  const [customFeats, setCustomFeats] = useState([])
  const [customClasses, setCustomClasses] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [showItemPaste, setShowItemPaste] = useState(false)
  const [showFeatPaste, setShowFeatPaste] = useState(false)
  const [showClassPaste, setShowClassPaste] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const refresh = () => {
    setCustomItems(getCustomItems())
    setCustomFeats(getCustomFeats())
    setCustomClasses(getCustomClasses())
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('dnd-realtime-custom-library', h)
    return () => window.removeEventListener('dnd-realtime-custom-library', h)
  }, [])

  const handleAddItem = (form) => {
    Promise.resolve(addCustomItem(form)).then(() => {
      setShowAddItem(false)
      refresh()
    })
  }

  const handleUpdateItem = (id, form) => {
    Promise.resolve(updateCustomItem(id, form)).then(() => {
      setEditingId(null)
      refresh()
    })
  }

  const handleRemoveItem = (id) => {
    if (window.confirm('确定删除该自定义物品？角色卡与仓库中已引用仍保留名称，但无法再从物品表选择。')) {
      Promise.resolve(removeCustomItem(id)).then(() => {
        setEditingId(null)
        refresh()
      })
    }
  }

  const handleAddFeatFromPaste = (data) => {
    addCustomFeat(data)
    refresh()
  }

  const handleRemoveFeat = (id) => {
    if (window.confirm('确定删除该自定义专长？')) {
      removeCustomFeat(id)
      refresh()
    }
  }

  const handleAddClassFromPaste = (data) => {
    const result = addCustomClass(data)
    if (!result) {
      window.alert('职业名与内置或已有自定义职业重复，未保存。')
      return
    }
    refresh()
  }

  const handleRemoveClass = (name) => {
    if (window.confirm(`确定删除自定义职业「${name}」？`)) {
      removeCustomClass(name)
      refresh()
    }
  }

  const builtInCount = ITEM_DATABASE.length

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-4 section-title">
        数据维护
      </h1>
      <p className="text-dnd-text-muted text-sm mb-6">
        仅 DM 使用，供角色卡与团队仓库调用。数据存于本机，不对外开放。支持手动新增与粘贴文本自动解析。
      </p>

      {/* 物品资料库 */}
      <section className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-dnd-gold" />
            <h2 className="font-display font-semibold text-white section-title">物品资料库</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowItemPaste(!showItemPaste); setShowAddItem(false) }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
                showItemPaste ? 'bg-dnd-gold text-white' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              粘贴录入
            </button>
            <button
              type="button"
              onClick={() => { setShowAddItem(true); setShowItemPaste(false); setEditingId(null) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              新增物品
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-dnd-text-muted text-xs mb-4">
            按类型分子目录：武器、枪械、盔甲、衣服、饰品、工具、弹药、载具与坐骑、冒险装备等。内置物品共 {builtInCount} 项（武器、盔甲等），仅作参考不可编辑。以下为自定义物品，团队仓库与角色卡下拉会同时显示内置与自定义。
          </p>

          {showItemPaste && (
            <div className="mb-6 p-4 rounded-lg bg-white/5 border border-dnd-gold/30">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-dnd-gold" />
                粘贴录入物品
              </h3>
              <PasteImporter
                kind="item"
                label="粘贴物品文本"
                icon={ClipboardPaste}
                placeholder={'粘贴物品描述文本。例如：\n长剑\n近战武器，1d8 挥砍，3磅，15 GP\n词条：灵巧、轻型\n精通：缓速'}
                onSave={(data) => { addCustomItem(data); refresh() }}
                renderPreview={(data) => <ItemPreview data={data} />}
              />
            </div>
          )}

          {showAddItem && (
            <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-white font-medium text-sm mb-3">新增自定义物品</h3>
              <ItemForm onSubmit={handleAddItem} onCancel={() => setShowAddItem(false)} />
            </div>
          )}

          {customItems.length === 0 ? (
            <p className="text-dnd-text-muted text-sm py-4">
              暂无自定义物品。点击「新增物品」手动添加，或「粘贴录入」从文本自动解析。
            </p>
          ) : (
            <div className="space-y-6">
              {(() => {
                const byType = {}
                customItems.forEach((item) => {
                  const t = TYPE_OPTIONS_FOR_FORM.includes(item.类型) ? item.类型 : '未分类'
                  if (!byType[t]) byType[t] = []
                  byType[t].push(item)
                })
                const typeOrder = [...TYPE_OPTIONS_FOR_FORM]
                if (byType['未分类']) typeOrder.push('未分类')
                return typeOrder.filter((t) => byType[t]?.length).map((typeName) => (
                  <div key={typeName}>
                    <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span>{typeName}</span>
                      <span className="text-dnd-text-muted font-normal normal-case text-xs">
                        （{byType[typeName].length}）
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {byType[typeName].map((item) => (
                        <li
                          key={item.id}
                          className="rounded-lg bg-white/5 border border-white/10 p-3"
                        >
                          {editingId === item.id ? (
                            <div>
                              <ItemForm
                                initial={item}
                                onSubmit={(form) => handleUpdateItem(item.id, form)}
                                onCancel={() => setEditingId(null)}
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-medium text-white">
                                    {getItemDisplayName(item)}
                                  </span>
                                  {item.类别 && (
                                    <span className="text-dnd-text-muted text-xs ml-2">
                                      {item.类别}
                                    </span>
                                  )}
                                  {(item.价格 || item.攻击 || item.精通) && (
                                    <p className="text-dnd-text-muted text-xs mt-1">
                                      {[item.价格, item.攻击, item.精通].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => { setEditingId(item.id); setShowAddItem(false) }}
                                    className="p-2 rounded-lg hover:bg-white/10 text-dnd-text-muted hover:text-white"
                                    title="编辑"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 text-dnd-text-muted hover:text-red-300"
                                    title="删除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      </section>

      {/* 专长资料库 */}
      <section className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-dnd-gold" />
            <h2 className="font-display font-semibold text-white section-title">专长资料库</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowFeatPaste(!showFeatPaste)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
              showFeatPaste ? 'bg-dnd-gold text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            粘贴录入
          </button>
        </div>
        <div className="p-4">
          <p className="text-dnd-text-muted text-xs mb-4">
            内置专长覆盖起源、通用、战斗风格、制作、灵能、星辰、传奇恩惠、九剑等分类。以下为自定义专长，角色卡专长选择弹窗会同时显示内置与自定义。
          </p>

          {showFeatPaste && (
            <div className="mb-6 p-4 rounded-lg bg-white/5 border border-dnd-gold/30">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-dnd-gold" />
                粘贴录入专长
              </h3>
              <PasteImporter
                kind="feat"
                label="粘贴专长文本（支持 Markdown 标题格式）"
                icon={ClipboardPaste}
                placeholder={'粘贴专长描述。例如：\n## 暗影步\n通用专长\n先决：等级 4+，敏捷 13+\n你获得以下增益：\n\n暗影闪现：每回合一次…'}
                onSave={handleAddFeatFromPaste}
                renderPreview={(data) => <FeatPreview data={data} />}
              />
            </div>
          )}

          {customFeats.length === 0 ? (
            <p className="text-dnd-text-muted text-sm py-4">
              暂无自定义专长。点击「粘贴录入」从文本自动解析。
            </p>
          ) : (
            <div className="space-y-2">
              {customFeats.map((feat) => (
                <li
                  key={feat.id}
                  className="rounded-lg bg-white/5 border border-white/10 p-3 list-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{feat.name}</span>
                        <span className="text-dnd-text-muted text-xs">{feat.category}</span>
                      </div>
                      {feat.prerequisite && (
                        <p className="text-dnd-text-muted text-xs mt-0.5">先决：{feat.prerequisite}</p>
                      )}
                      <p className="text-gray-300 text-xs mt-1 line-clamp-2 whitespace-pre-line">
                        {feat.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFeat(feat.id)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-dnd-text-muted hover:text-red-300 shrink-0"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 职业资料库 */}
      <section className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-dnd-gold" />
            <h2 className="font-display font-semibold text-white section-title">职业资料库</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowClassPaste(!showClassPaste)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
              showClassPaste ? 'bg-dnd-gold text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            粘贴录入
          </button>
        </div>
        <div className="p-4">
          <p className="text-dnd-text-muted text-xs mb-4">
            内置职业含 12 大基础职业与繁星进阶职业（圣魂之刃、岚御法师等）。以下为自定义职业，角色卡职业下拉会同时显示内置与自定义。粘贴录入支持 Markdown 格式（含概览表、等级成长表、特性条文）。
          </p>

          {showClassPaste && (
            <div className="mb-6 p-4 rounded-lg bg-white/5 border border-dnd-gold/30">
              <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-dnd-gold" />
                粘贴录入职业
              </h3>
              <PasteImporter
                kind="class"
                label="粘贴职业文本（Markdown 格式，含等级表与特性条文）"
                icon={ClipboardPaste}
                placeholder={'粘贴职业描述（Markdown）。需包含：\n# 职业名\n## 职业概览（含生命骰、豁免、护甲、武器）\n## 等级成长表（| 等级 | 特性 |）\n## 特性条文（### 特性名（N 级））'}
                onSave={handleAddClassFromPaste}
                renderPreview={(data) => <ClassPreview data={data} />}
              />
            </div>
          )}

          {customClasses.length === 0 ? (
            <p className="text-dnd-text-muted text-sm py-4">
              暂无自定义职业。点击「粘贴录入」从 Markdown 文本自动解析。
            </p>
          ) : (
            <div className="space-y-2">
              {customClasses.map((cls) => (
                <li
                  key={cls.name}
                  className="rounded-lg bg-white/5 border border-white/10 p-3 list-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{cls.name}</span>
                        <span className="text-dnd-text-muted text-xs">d{cls.hitDice}</span>
                        <span className="text-dnd-gold-light text-xs">自定义</span>
                      </div>
                      {cls.requirements && (
                        <p className="text-dnd-text-muted text-xs mt-0.5">先决：{cls.requirements}</p>
                      )}
                      {cls.flavor && (
                        <p className="text-gray-300 text-xs mt-1 line-clamp-2">{cls.flavor}</p>
                      )}
                      <p className="text-dnd-text-muted text-xs mt-1">
                        特性 {cls.features?.length || 0} 项
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveClass(cls.name)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-dnd-text-muted hover:text-red-300 shrink-0"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-4">
        <p className="text-dnd-text-muted text-sm">
          法术大全支持在「法术大全」页内直接新增自定义法术。物品、专长、职业均支持粘贴录入，解析后会标注缺失字段供确认。
        </p>
      </div>
    </div>
  )
}
