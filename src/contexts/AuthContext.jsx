import { createContext, useContext, useState } from 'react'
import { getStoredUser, setStoredUser, clearStoredUser, isUserAdmin } from '../lib/auth'
import { clearSpellsPageViewState } from '../lib/spellsPageViewState'

const AuthContext = createContext(null)

function readUserFromStorage() {
  try {
    return getStoredUser() ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  /** 首帧即同步读 localStorage，避免仅靠 useEffect 时在某些环境下长期停在 undefined → 一直「加载中」 */
  const [user, setUser] = useState(() => readUserFromStorage())

  const login = (name) => {
    const n = String(name).trim()
    if (!n) return
    clearSpellsPageViewState()
    setStoredUser(n)
    setUser({
      name: n,
      isAdmin: isUserAdmin(n),
    })
  }

  const logout = () => {
    clearSpellsPageViewState()
    clearStoredUser()
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    isAdmin: user?.isAdmin ?? false,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
