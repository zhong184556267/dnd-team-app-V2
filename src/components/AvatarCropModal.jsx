import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImgDataUrl, compressAvatarDataUrl, AVATAR_MAX_BYTES } from '../lib/avatarCrop'

const ASPECT_MIN = 0.45
const ASPECT_MAX = 3.2

/**
 * 上传后按外显框比例裁剪（圆角矩形与角色卡右侧头像区一致）
 */
export default function AvatarCropModal({ open, imageSrc, aspect: aspectProp, onCancel, onConfirm }) {
  const aspect = Number(aspectProp) > 0
    ? Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, aspectProp))
    : 1
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPixels, setAreaPixels] = useState(null)
  const [busy, setBusy] = useState(false)

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setAreaPixels(croppedAreaPixels)
  }, [])

  useEffect(() => {
    if (open && imageSrc) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setAreaPixels(null)
    }
  }, [open, imageSrc])

  const handleConfirm = async () => {
    if (!imageSrc || !areaPixels) return
    setBusy(true)
    try {
      const raw = await getCroppedImgDataUrl(imageSrc, areaPixels)
      const out = await compressAvatarDataUrl(raw, AVATAR_MAX_BYTES)
      onConfirm(out)
    } catch (e) {
      alert(e?.message || '处理失败')
    } finally {
      setBusy(false)
    }
  }

  if (!open || !imageSrc) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--card-border)] p-4 shadow-2xl"
        style={{ background: 'var(--card-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="avatar-crop-title" className="mb-1 text-base font-bold text-[var(--text-title)]">
          裁剪头像
        </h3>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          拖动、缩放图片；框线与角色卡右侧头像区域比例、圆角一致
        </p>
        <div
          className="relative mx-auto w-full max-w-[min(92vw,520px)] overflow-hidden rounded-xl bg-[#0a0a0a] ring-1 ring-[var(--border-color)]"
          style={{ aspectRatio: aspect }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            classes={{
              containerClassName: 'rounded-xl',
              cropAreaClassName: '!rounded-[0.75rem]',
            }}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-xs text-[var(--text-muted)]">缩放</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[var(--accent)]"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--card-border)] pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm text-[var(--text-main)] hover:bg-white/5 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !areaPixels}
            className="rounded-lg bg-[var(--btn-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '处理中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
