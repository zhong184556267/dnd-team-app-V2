import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Characters from './pages/Characters'
import CharacterNew from './pages/CharacterNew'
import CharacterSheet from './pages/CharacterSheet'
import Warehouse from './pages/Warehouse'
import Spells from './pages/Spells'
import More from './pages/More'
import HouseRules from './pages/HouseRules'
import DataMaintain from './pages/DataMaintain'

function AppRoutes() {
  const { user } = useAuth()

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-dnd-bg flex items-center justify-center">
        <p className="text-dnd-text-label">加载中…</p>
      </div>
    )
  }
  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/characters" element={<Characters />} />
        <Route path="/characters/new" element={<CharacterNew />} />
        <Route path="/characters/:id" element={<CharacterSheet />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/spells" element={<Spells />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/house-rules" element={<HouseRules />} />
        <Route path="/more/data" element={<DataMaintain />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
