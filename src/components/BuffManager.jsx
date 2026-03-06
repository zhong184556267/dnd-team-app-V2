import { useState } from 'react'
import { Plus } from 'lucide-react'
import BuffListItem from './BuffListItem'
import BuffForm from './BuffForm'

export default function BuffManager({ buffs = [], baseAbilities = {}, onSave, canEdit }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const list = Array.isArray(buffs) ? buffs : []

  const handleAdd = () => {
    setEditingId(null)
    setShowForm(true)
  }

  const handleSave = (buff) => {
    const next = editingId
      ? list.map((b) => (b.id === editingId ? { ...buff, id: b.id } : b))
      : [...list, { ...buff, id: String(Date.now()) }]
    onSave(next)
    setShowForm(false)
    setEditingId(null)
  }

  const handleEdit = (id) => {
    const b = list.find((x) => x.id === id)
    if (b) {
      setEditingId(id)
      setShowForm(true)
    }
  }

  const handleToggle = (id, enabled) => {
    const next = list.map((b) => (b.id === id ? { ...b, enabled } : b))
    onSave(next)
  }

  const handleDelete = (id) => {
    const next = list.filter((b) => b.id !== id)
    onSave(next)
  }

  return (
    <div className="rounded-xl border border-gray-600 bg-dnd-card p-3">
      <div className="flex items-center justify-end mb-2">
        {canEdit && (
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加增益/减值
          </button>
        )}
      </div>

      <div className="overflow-hidden">
        {list.length === 0 ? (
          <p className="text-gray-500 text-xs py-4 text-center">暂无增益/减值</p>
        ) : (
          list.map((buff) => (
            <BuffListItem
              key={buff.id}
              buff={buff}
              baseAbilities={baseAbilities}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canEdit={canEdit}
            />
          ))
        )}
      </div>

      {showForm && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={() => { setShowForm(false); setEditingId(null) }}
            aria-hidden
          />
          <div
            className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:w-full z-[201] overflow-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <BuffForm
              initial={editingId ? list.find((b) => b.id === editingId) : undefined}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingId(null) }}
            />
          </div>
        </>
      )}
    </div>
  )
}
