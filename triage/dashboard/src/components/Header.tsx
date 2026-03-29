import { WorldIDButton } from './WorldIDButton'

export type TabId = 'dashboard' | 'marketplace' | 'content'

const TABS: { id: TabId; label: string; secondary?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'content', label: 'Content (Beta)', secondary: true },
]

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-[6px] h-[6px]">
        {connected && (
          <div className="absolute inset-[-3px] rounded-full bg-green-400/20 animate-ping" />
        )}
        <div className={`absolute inset-0 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400/60'}`} />
      </div>
      <span className={`text-[10px] font-medium tracking-wide ${connected ? 'text-white/60' : 'text-red-400/60'}`}>
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

export function Header({ isConnected, activeTab, onTabChange, onVerified }: {
  isConnected: boolean
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onVerified: (id: string) => void
}) {
  return (
    <header className="h-[52px] shrink-0 relative z-10">
      <div className="max-w-[1320px] mx-auto w-full h-full flex items-center justify-between px-6">
        {/* Left: logo + tabs */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="1" y="1" width="22" height="22" rx="6" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
              <circle cx="8.5" cy="8.5" r="2.5" fill="#36d068" opacity="0.7" />
              <circle cx="15.5" cy="8.5" r="2.5" fill="#4a91f7" opacity="0.7" />
              <circle cx="8.5" cy="15.5" r="2.5" fill="#f0a020" opacity="0.7" />
              <circle cx="15.5" cy="15.5" r="2.5" fill="#ee5555" opacity="0.4" />
            </svg>
            <span className="text-sm font-bold tracking-wide text-white">
              TRIAGE
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-white bg-white/[0.1]'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]'
                } ${tab.secondary ? 'opacity-40' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: version + World ID + live */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-white/25">v2.4.1</span>
          <WorldIDButton onVerified={onVerified} />
          <LiveDot connected={isConnected} />
        </div>
      </div>
    </header>
  )
}
