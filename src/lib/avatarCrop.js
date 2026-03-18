/**
 * 头像裁剪：从 react-easy-crop 的 pixelCrop 生成图，再压缩到 maxBytes 以内。
 */

export const AVATAR_MAX_BYTES = 800 * 1024

export function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (e) => reject(e))
    image.src = url
  })
}

/** @param {string} imageSrc data URL 或 URL */
export async function getCroppedImgDataUrl(imageSrc, pixelCrop) {
  if (!pixelCrop || pixelCrop.width < 1 || pixelCrop.height < 1) {
    throw new Error('无效裁剪区域')
  }
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const { x, y, width, height } = pixelCrop
  canvas.width = Math.floor(width)
  canvas.height = Math.floor(height)
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

const APPROX_BYTES = (dataUrl) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

/**
 * 将方形头像压到 maxBytes 以下（缩放 + JPEG 质量）
 */
export async function compressAvatarDataUrl(dataUrl, maxBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let maxEdge = 640
      const run = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        let q = 0.88
        let out = canvas.toDataURL('image/jpeg', q)
        while (APPROX_BYTES(out) > maxBytes && q > 0.42) {
          q -= 0.06
          out = canvas.toDataURL('image/jpeg', q)
        }
        if (APPROX_BYTES(out) > maxBytes && maxEdge > 160) {
          maxEdge = Math.floor(maxEdge * 0.82)
          run()
          return
        }
        if (APPROX_BYTES(out) > maxBytes) {
          reject(new Error('无法压缩到足够小，请换一张图试试'))
          return
        }
        resolve(out)
      }
      run()
    }
    img.onerror = () => reject(new Error('图片处理失败'))
    img.src = dataUrl
  })
}
