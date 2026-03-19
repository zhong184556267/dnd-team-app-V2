/**
 * 将 patch 合并进角色对象（乐观更新 / 合并待同步补丁）
 * - 对象：递归合并（如 hp、equipment）
 * - 数组与原始值：以 patch 为准整段替换
 */
export function mergeCharacterPatch(target, patch) {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch
  }
  if (target == null || typeof target !== 'object' || Array.isArray(target)) {
    return { ...patch }
  }
  const out = { ...target }
  for (const k of Object.keys(patch)) {
    const pv = patch[k]
    const tv = target[k]
    if (pv != null && typeof pv === 'object' && !Array.isArray(pv)) {
      if (tv != null && typeof tv === 'object' && !Array.isArray(tv)) {
        out[k] = mergeCharacterPatch(tv, pv)
      } else {
        out[k] = { ...pv }
      }
    } else {
      out[k] = pv
    }
  }
  return out
}

/** 多条 patch 合并为一条再发网络请求 */
export function mergePatchesList(patches) {
  return patches.reduce((acc, p) => mergeCharacterPatch(acc, p), {})
}
