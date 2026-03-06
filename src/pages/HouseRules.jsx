import { Link } from 'react-router-dom'

export default function HouseRules() {
  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        繁星特色（房规/模组）
      </h1>
      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4">
        <p className="text-dnd-text-muted text-sm">
          富文本房规与模组说明，开发中。
        </p>
      </div>
    </div>
  )
}
