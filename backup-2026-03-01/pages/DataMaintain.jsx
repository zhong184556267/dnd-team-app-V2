import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import {
  ITEM_DATABASE,
  ITEM_TYPES,
  getCustomItems,
  getItemDisplayName,
  addCustomItem,
  updateCustomItem,
  removeCustomItem,
} from '../data/itemDatabase'
import { inputClass, textareaClass } from '../lib/inputStyles'

const SUBTYPE_BY_TYPE = {
  武器: ['近战', '远程'],
  盔甲: ['轻甲', '中甲', '重甲', '盾牌'],
  载具与坐骑: ['坐骑与其他动物', '鞍具挽具与陆运载具', '空中与水上载具'],
  工具: ['工匠工具', '工具包与套组', '赌具', '乐器'],
  弹药: ['箭矢', '弩矢', '枪械子弹', '投石索子弹', '吹矢', '容器'],
  饰品: ['戒指', '项链', '手镯', '耳环', '护身符', '其他'],
  冒险装备: ['消耗品', '容器', '套组', '照明与燃料', '书写与记录', '其他'],
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
    类型: '武器',
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
          value={form.类型 && ITEM_TYPES.includes(form.类型) ? form.类型 : '武器'}
          onChange={(e) => update('类型', e.target.value)}
          className={inputClass}
        >
          {ITEM_TYPES.map((t) => (
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

export default function DataMaintain() {
  const [customItems, setCustomItems] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const refresh = () => {
    setCustomItems(getCustomItems())
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleAddItem = (form) => {
    addCustomItem(form)
    setShowAddItem(false)
    refresh()
  }

  const handleUpdateItem = (id, form) => {
    updateCustomItem(id, form)
    setEditingId(null)
    refresh()
  }

  const handleRemoveItem = (id) => {
    if (window.confirm('确定删除该自定义物品？角色卡与仓库中已引用仍保留名称，但无法再从物品表选择。')) {
      removeCustomItem(id)
      setEditingId(null)
      refresh()
    }
  }

  const builtInCount = ITEM_DATABASE.length

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        数据维护
      </h1>
      <p className="text-dnd-text-muted text-sm mb-6">
        仅 DM 使用，供角色卡与团队仓库调用。数据存于本机，不对外开放。
      </p>

      {/* 物品资料库 */}
      <section className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-dnd-gold" />
            <h2 className="font-display font-semibold text-white">物品资料库</h2>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddItem(true); setEditingId(null) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            新增物品
          </button>
        </div>
        <div className="p-4">
          <p className="text-dnd-text-muted text-xs mb-4">
            按类型分子目录：武器、枪械、盔甲、衣服、饰品、工具、弹药、载具与坐骑、冒险装备等。内置物品共 {builtInCount} 项（武器、盔甲等），仅作参考不可编辑。以下为自定义物品，团队仓库与角色卡下拉会同时显示内置与自定义。
          </p>

          {showAddItem && (
            <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-white font-medium text-sm mb-3">新增自定义物品</h3>
              <ItemForm onSubmit={handleAddItem} onCancel={() => setShowAddItem(false)} />
            </div>
          )}

          {customItems.length === 0 ? (
            <p className="text-dnd-text-muted text-sm py-4">
              暂无自定义物品。点击「新增物品」添加，并选择类型（子目录），即可在团队仓库与角色卡中选择。
            </p>
          ) : (
            <div className="space-y-6">
              {(() => {
                const byType = {}
                customItems.forEach((item) => {
                  const t = ITEM_TYPES.includes(item.类型) ? item.类型 : '未分类'
                  if (!byType[t]) byType[t] = []
                  byType[t].push(item)
                })
                const typeOrder = [...ITEM_TYPES]
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

      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4">
        <p className="text-dnd-text-muted text-sm">
          职业表、专长表等维护功能开发中。法术大全支持在「法术大全」页内直接新增自定义法术。
        </p>
      </div>
    </div>
  )
}
