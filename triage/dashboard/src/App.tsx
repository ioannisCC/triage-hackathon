import { useState, useEffect } from 'react'
import { WS_URL } from './config'
import { useWebSocket } from './hooks/useWebSocket'
import { Header } from './components/Header'
import type { TabId } from './components/Header'
import { DashboardTab } from './components/tabs/DashboardTab'
import { MarketplaceTab } from './components/tabs/MarketplaceTab'
import { ContentTab } from './components/tabs/ContentTab'

function getTabFromHash(): TabId {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'marketplace' || hash === 'content') return hash
  return 'dashboard'
}

export default function App() {
  const { events, isConnected } = useWebSocket(WS_URL)
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromHash)
  const [isVerified, setIsVerified] = useState(false)

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleVerified = (id: string) => {
    console.log('[WorldID] Verified:', id)
    setIsVerified(true)
  }

  return (
    <div
      className="w-full h-screen flex flex-col font-sans text-fg overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 35%, #111827 0%, #090d15 50%, #060a10 100%)' }}
    >
      <Header
        isConnected={isConnected}
        activeTab={activeTab}
        onTabChange={(t) => { window.location.hash = t; setActiveTab(t) }}
        onVerified={handleVerified}
      />

      {activeTab === 'dashboard' && <DashboardTab events={events} />}
      {activeTab === 'marketplace' && <MarketplaceTab events={events} isVerified={isVerified} />}
      {activeTab === 'content' && <ContentTab events={events} isVerified={isVerified} />}
    </div>
  )
}
