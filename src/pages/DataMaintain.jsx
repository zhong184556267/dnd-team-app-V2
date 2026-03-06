import { Link } from 'react-router-dom'

export default function DataMaintain() {
  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        数据维护
      </h1>
      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4">
        <p className="text-dnd-text-muted text-sm">
          物品百科、职业、专长等，仅 DM 可编辑，开发中。
        </p>
      </div>
    </div>
  )
}
