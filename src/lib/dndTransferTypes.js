/**
 * dataTransfer.types 在部分环境为 DOMStringList（仅有 .contains），
 * 在 dragover 阶段需可靠检测，否则不会触发 drop。
 */
export function dataTransferHasType(dataTransfer, mime) {
  const types = dataTransfer?.types
  if (!types) return false
  if (typeof types.includes === 'function') return types.includes(mime)
  if (typeof types.contains === 'function') return types.contains(mime)
  try {
    return Array.from(types).includes(mime)
  } catch {
    return false
  }
}
