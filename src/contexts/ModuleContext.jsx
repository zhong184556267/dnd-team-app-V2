import { createContext, useContext, useState, useEffect } from 'react'
import { getModules, getCurrentModuleId, setCurrentModuleId as persistCurrentModuleId } from '../lib/moduleStore'

const ModuleContext = createContext(null)

export function ModuleProvider({ children }) {
  const [modules, setModules] = useState(() => getModules())
  const [currentModuleId, setCurrentModuleIdState] = useState(() => getCurrentModuleId())

  useEffect(() => {
    setModules(getModules())
    setCurrentModuleIdState(getCurrentModuleId())
  }, [])

  const setCurrentModuleId = (id) => {
    persistCurrentModuleId(id)
    setCurrentModuleIdState(id)
    setModules(getModules())
  }

  const refreshModules = () => {
    setModules(getModules())
    setCurrentModuleIdState(getCurrentModuleId())
  }

  const value = {
    modules,
    currentModuleId,
    setCurrentModuleId,
    refreshModules,
  }

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

export function useModule() {
  const ctx = useContext(ModuleContext)
  if (!ctx) throw new Error('useModule must be used within ModuleProvider')
  return ctx
}
