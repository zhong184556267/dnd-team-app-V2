/** DM 判定：此名字为管理员（可后续改为配置） */
export const ADMIN_NAME = 'AdminBEAR'

const STORAGE_KEY = 'starlight_user'

/**
 * 从 localStorage 读取已记住的用户
 * @returns {{ name: string, isAdmin: boolean } | null}
 */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.name) return null
    return {
      name: String(data.name).trim(),
      isAdmin: data.name.trim() === ADMIN_NAME,
    }
  } catch {
    return null
  }
}

/**
 * 登录并记住用户
 * @param {string} name
 */
export function setStoredUser(name) {
  const n = String(name).trim()
  if (!n) return
  const user = {
    name: n,
    isAdmin: n === ADMIN_NAME,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

/**
 * 登出，清除记住的用户
 */
export function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY)
}
