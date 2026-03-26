import { useEffect, useMemo, useRef } from 'react'
import { Engine, World, Bodies, Body } from 'matter-js'

function paletteForKind(kind) {
  if (kind === 'd20') return { fill: '#C79A42', stroke: '#8C672A', text: '#fff7df' }
  if (kind === 'cube') return { fill: '#E01C2F', stroke: '#7A1F20', text: '#fff5f5' }
  if (kind === 'd8') return { fill: '#7C3AED', stroke: '#4C1D95', text: '#f3e8ff' }
  if (kind === 'd10') return { fill: '#0EA5E9', stroke: '#0C4A6E', text: '#e0f2fe' }
  if (kind === 'd12') return { fill: '#10B981', stroke: '#065F46', text: '#d1fae5' }
  return { fill: '#7C3AED', stroke: '#3B1780', text: '#f3e8ff' }
}

export default function PhysicsDiceOverlay({ diceSpecs = [], onFirstFrame, onRenderError }) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const normalized = useMemo(() => {
    return (diceSpecs || []).map((d, i) => ({
      id: `${d.id || i}`,
      sides: Number(d.sides) || 6,
      kind:
        d.shape === 'cube' ? 'cube' :
        d.shape === 'd8' ? 'd8' :
        d.shape === 'd10' ? 'd10' :
        d.shape === 'd12' ? 'd12' :
        d.shape === 'd20' ? 'd20' : 'poly',
    }))
  }, [diceSpecs])

  useEffect(() => {
    let mounted = true
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return undefined

    let engine = null
    let world = null
    let firstFrame = false
    let watchdog = 0
    try {
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = width
      canvas.height = height

      engine = Engine.create({
        gravity: { x: 0, y: 1.05, scale: 0.0018 },
      })
      world = engine.world
      const boundsThickness = 80
      const floor = Bodies.rectangle(width / 2, height + boundsThickness / 2 - 28, width + boundsThickness * 2, boundsThickness, { isStatic: true })
      const leftWall = Bodies.rectangle(-boundsThickness / 2 + 10, height / 2, boundsThickness, height + boundsThickness * 2, { isStatic: true })
      const rightWall = Bodies.rectangle(width + boundsThickness / 2 - 10, height / 2, boundsThickness, height + boundsThickness * 2, { isStatic: true })
      World.add(world, [floor, leftWall, rightWall])

      const diceBodies = normalized.map((d, idx) => {
        const size = d.kind === 'd20' ? 32 : d.kind === 'cube' ? 34 : 32
        const fromLeft = idx % 2 === 0
        const spawnX = fromLeft ? -70 - idx * 18 : width + 70 + idx * 18
        const spawnY = 40 + (idx % 4) * 26
        const common = {
          restitution: 0.58,
          friction: 0.015,
          frictionAir: 0.012,
          density: 0.0018,
          angle: (Math.random() * Math.PI) / 2,
          label: d.id,
        }
        let body
        if (d.kind === 'cube') {
          body = Bodies.rectangle(spawnX, spawnY, size, size, common)
        } else {
          const vertices =
            d.kind === 'd8' ? 8 :
            d.kind === 'd10' ? 10 :
            d.kind === 'd12' ? 12 :
            d.kind === 'd20' ? 20 : 6
          body = Bodies.polygon(spawnX, spawnY, vertices, size * 0.58, common)
        }
        Body.setVelocity(body, { x: fromLeft ? 8 + Math.random() * 3 : -8 - Math.random() * 3, y: -1 - Math.random() * 2.4 })
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.45)
        return { ...d, size, body, palette: paletteForKind(d.kind) }
      })
      World.add(world, diceBodies.map((d) => d.body))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        if (typeof onRenderError === 'function') onRenderError('canvas-context')
        return undefined
      }

      const draw = () => {
        if (!mounted) return
        Engine.update(engine, 1000 / 60)
        ctx.clearRect(0, 0, width, height)
        if (!firstFrame) {
          firstFrame = true
          if (typeof onFirstFrame === 'function') onFirstFrame()
        }
        for (const d of diceBodies) {
        const b = d.body
        const speed = Math.min(1, b.speed / 13)
        const shadowW = d.size * (1.05 - speed * 0.28)
        const shadowH = 8 + speed * 2
        ctx.save()
        ctx.translate(b.position.x, b.position.y + d.size * 0.62)
        ctx.scale(shadowW / d.size, shadowH / d.size)
        ctx.fillStyle = `rgba(0,0,0,${0.34 - speed * 0.16})`
        ctx.beginPath()
        ctx.arc(0, 0, d.size * 0.48, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.translate(b.position.x, b.position.y)
        ctx.rotate(b.angle)
        ctx.fillStyle = d.palette.fill
        ctx.strokeStyle = d.palette.stroke
        ctx.lineWidth = 1.4
        if (d.kind === 'cube') {
          const s = d.size
          ctx.beginPath()
          ctx.rect(-s / 2, -s / 2, s, s)
          ctx.fill()
          ctx.stroke()
        } else {
          const sides =
            d.kind === 'd8' ? 8 :
            d.kind === 'd10' ? 10 :
            d.kind === 'd12' ? 12 :
            d.kind === 'd20' ? 20 : 6
          const r = d.size * 0.56
          ctx.beginPath()
          for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2 - Math.PI / 2
            const x = Math.cos(a) * r
            const y = Math.sin(a) * r
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
        ctx.fillStyle = d.palette.text
        ctx.font = 'bold 12px "Noto Sans SC", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`d${d.sides}`, 0, 0)
        ctx.restore()
      }

        rafRef.current = window.requestAnimationFrame(draw)
      }

      rafRef.current = window.requestAnimationFrame(draw)
      watchdog = window.setTimeout(() => {
        if (!firstFrame && typeof onRenderError === 'function') onRenderError('no-first-frame')
      }, 280)
    } catch (err) {
      if (typeof onRenderError === 'function') onRenderError(String(err?.message || err))
    }

    return () => {
      mounted = false
      if (watchdog) window.clearTimeout(watchdog)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      if (world) World.clear(world, false)
      if (engine) Engine.clear(engine)
    }
  }, [normalized, onFirstFrame, onRenderError])

  return (
    <div ref={hostRef} className="pointer-events-none fixed inset-0 z-[70]">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

