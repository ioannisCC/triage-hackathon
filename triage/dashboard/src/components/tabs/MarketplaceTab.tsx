import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { cn } from '../../lib/utils'
import type { TriageEvent, AgentProfile } from '../../types'

import { API_URL } from '../../config'
const API = API_URL

interface ChatMsg { id: number; role: 'user' | 'bot'; text: string }
let msgIdCounter = 0

// ─── Agent Card — Liquid Glass, Fixed Size ───────────────────────────

function AgentCard({ agent, isSelected, isActive, onSelect }: {
  agent: AgentProfile; isSelected: boolean; isActive: boolean; onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = (e: PointerEvent) => {
      if (!cardRef.current) return
      const r = cardRef.current.getBoundingClientRect()
      cardRef.current.style.setProperty('--x', `${e.clientX - r.left}px`)
      cardRef.current.style.setProperty('--y', `${e.clientY - r.top}px`)
    }
    document.addEventListener('pointermove', sync)
    return () => document.removeEventListener('pointermove', sync)
  }, [])

  const tierAccent = agent.tier === 'HUMAN_AGENT' ? '#4a91f7' : '#f0a020'

  const glassBase = 'inset 0 1px 0 0 rgba(255,255,255,0.1), inset 0 -1px 0 0 rgba(255,255,255,0.02)'
  const shadow = isActive
    ? `${glassBase}, 0 0 0 0.5px rgba(54,208,104,0.2), 0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(54,208,104,0.08)`
    : hovered
      ? `${glassBase}, 0 0 0 0.5px ${tierAccent}30, 0 12px 40px rgba(0,0,0,0.5), 0 0 15px ${tierAccent}08`
      : isSelected
        ? `${glassBase}, 0 0 0 0.5px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.5)`
        : `${glassBase}, 0 0 0 0.5px rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.5)`

  return (
    <motion.div
      ref={cardRef}
      onClick={onSelect}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative cursor-pointer"
      style={{ width: 200, zIndex: hovered ? 50 : 1 }}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all duration-500 backdrop-blur-2xl bg-white/[0.04]"
        style={{ height: 120, boxShadow: shadow }}
      >
        {/* Glass gradient overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.06] via-transparent to-white/[0.02]" />

        {/* Spotlight on hover */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-700"
          style={{
            opacity: hovered ? 0.6 : 0,
            background: 'radial-gradient(180px circle at var(--x,50%) var(--y,50%), rgba(255,255,255,0.04), transparent 70%)',
          }}
        />

        <div className="relative z-10 p-5 flex flex-col gap-2 h-full">
          {/* Name + Score */}
          <div className="flex items-center justify-between">
            <span className="text-white/85 font-medium text-sm truncate mr-2">{agent.name || agent.address.slice(0, 10)}</span>
            <span className="font-mono text-xs shrink-0" style={{ color: hovered ? tierAccent : 'rgba(255,255,255,0.4)' }}>
              {agent.trustScore}
            </span>
          </div>

          {/* Specialty — clipped to fit fixed height */}
          <p className="text-white/35 text-xs leading-relaxed line-clamp-2 flex-1">{agent.specialty || 'General purpose'}</p>

          {/* Active badge */}
          {isActive && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span className="text-[9px] uppercase tracking-[0.15em] font-semibold text-green-400/80">Active</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Hover details — absolute tooltip below card */}
      <AnimatePresence>
        {hovered && !isActive && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl px-4 py-3 backdrop-blur-2xl bg-white/[0.04] border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-white/30">
                <span>{agent.totalRequests} tasks</span>
                <span className="font-mono">${agent.platformFee != null ? agent.platformFee.toFixed(4) : '—'}/req</span>
              </div>
              <div className="flex justify-between text-white/30">
                <span>{agent.tier === 'HUMAN_AGENT' ? 'Human-Backed' : 'Bot'}</span>
                <span className="font-mono" style={{ color: tierAccent + '80' }}>
                  {agent.hirePriceBand || '—'} ${agent.hirePriceMin != null ? agent.hirePriceMin : '—'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Glass Chat Pill Input ───────────────────────────────────────────

function GlassChatInput({ onSend, loading, selectedAgent }: {
  onSend: (msg: string) => void; loading: boolean; selectedAgent: AgentProfile | null
}) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    if (!value.trim() || loading) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-full px-5 py-3',
      'backdrop-blur-2xl bg-white/[0.02]',
      'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_4px_16px_rgba(0,0,0,0.2)]',
      'transition-all duration-300',
      'focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_4px_16px_rgba(0,0,0,0.3)]',
    )}>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
        placeholder={selectedAgent?.name ? `What should ${selectedAgent.name} do?` : 'What do you need?'}
        className="flex-1 bg-transparent text-white/80 text-sm placeholder:text-white/20 focus:outline-none min-w-0"
      />
      <motion.button
        onClick={handleSend}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        disabled={loading || !value.trim()}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0',
          value.trim()
            ? 'bg-white/90 text-black shadow-[0_0_12px_rgba(255,255,255,0.15)]'
            : 'bg-white/[0.06] text-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl',
        )}
      >
        {loading ? (
          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
      </motion.button>
    </div>
  )
}

// ─── Main MarketplaceTab ─────────────────────────────────────────────

export function MarketplaceTab({ events: _events, isVerified }: { events: TriageEvent[]; isVerified: boolean }) {
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [selected, setSelected] = useState<AgentProfile | null>(null)
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isVerified) setShowVerifyModal(false)
  }, [isVerified])

  useEffect(() => {
    const load = () => {
      fetch(`${API}/api/agents`)
        .then(r => r.json())
        .then((all: AgentProfile[]) => {
          setAgents(
            all.filter(a => a.tier === 'HUMAN_AGENT' || a.tier === 'ANON_BOT')
              .sort((a, b) => b.trustScore - a.trustScore)
              .slice(0, 8)
          )
        })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (text: string) => {
    if (!isVerified) { setShowVerifyModal(true); return }
    setMessages(prev => [...prev, { id: ++msgIdCounter, role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          selectedAgent: selected?.name,
          history: messages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        }),
      })
      const data = await res.json() as { response: string; action?: { intent: string; address?: string; task?: string } }
      console.log('[CHAT DEBUG] status:', res.status, 'data:', JSON.stringify(data).slice(0, 200))
      const botReply = data.response || 'Done.'
      setMessages(prev => [...prev, { id: ++msgIdCounter, role: 'bot', text: botReply }])
      if (data.action?.intent === 'hire_agent' && data.action.address) {
        const found = agents.find(a =>
          a.name?.toLowerCase().includes(data.action!.address!.toLowerCase())
          || a.address.toLowerCase() === data.action!.address!.toLowerCase()
        )
        if (found) {
          setActiveAgents(prev => new Set(prev).add(found.address))
          setSelected(found)
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: ++msgIdCounter, role: 'bot', text: 'Error connecting to server.' }])
    }
    setLoading(false)
  }

  return (
    <div className="relative h-full flex flex-col overflow-hidden">

      {/* Scrollable content */}
      <div className="relative z-10 flex-1 flex flex-col items-center gap-6 px-4 pt-16 pb-6 overflow-y-auto scrollbar-hide">

        {/* Title — ALWAYS visible */}
        <div className="text-center shrink-0">
          <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40">
            Hire an Agent
          </h1>
          <p className="text-sm text-white/30 mt-2">Choose an agent or describe what you need</p>
        </div>

        {/* Agent cards — fixed size, flex wrap */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-16 shrink-0 max-w-[1100px] overflow-visible">
          <AnimatePresence mode="popLayout">
            {(showAll ? agents : agents.slice(0, 5)).map((a, i) => (
              <motion.div
                key={a.address}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                transition={{
                  duration: 0.4,
                  delay: i > 4 ? (i - 5) * 0.08 : 0,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <AgentCard
                  agent={a}
                  isSelected={selected?.address === a.address}
                  isActive={activeAgents.has(a.address)}
                  onSelect={() => setSelected(a)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {agents.length === 0 && <p className="text-white/20 text-sm">Loading agents...</p>}
        </div>

        {agents.length > 5 && (
          <motion.button
            onClick={() => setShowAll(prev => !prev)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-2 shrink-0"
          >
            <span className="text-xs font-medium tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white/50 to-white/25 hover:from-white/70 hover:to-white/40 transition-all">
              {showAll ? 'Show less' : `+${agents.length - 5} more agents`}
            </span>
          </motion.button>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div
            className="w-full max-w-[650px] max-h-[400px] overflow-y-auto scrollbar-hide px-2 py-6 space-y-4 shrink-0"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
            }}
          >
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    'max-w-[65%] w-fit rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'ml-auto bg-white/[0.05] text-white/80'
                      : 'mr-auto bg-white/[0.03] text-white/50',
                  )}
                >
                  {msg.role === 'bot' ? (
                    <div className="prose prose-invert prose-sm max-w-none [&_p]:text-white/50 [&_p]:m-0 [&_strong]:text-white/70 [&_li]:text-white/50 [&_ul]:my-1 [&_ol]:my-1 [&_h1]:text-white/60 [&_h2]:text-white/60 [&_h3]:text-white/60 [&_h3]:text-sm [&_h2]:text-sm">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {loading && (
              <div className="flex items-center gap-1.5 text-white/30 text-xs mr-auto">
                <span>Thinking</span>
                {[0, 1, 2].map(d => (
                  <motion.span
                    key={d}
                    className="w-1 h-1 bg-white/40 rounded-full"
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                  />
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Chat input — glass pill, pinned bottom */}
      <div className="relative z-10 shrink-0 px-4 pb-5 pt-2 flex flex-col items-center">
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-2"
          >
            <span className="text-xs text-white/30">Talking to</span>
            <span className="text-xs text-white/60 font-medium bg-white/[0.05] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] px-3 py-1 rounded-full">
              {selected.name} · {selected.trustScore}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-white/20 hover:text-white/50 text-xs transition-colors"
            >
              ✕
            </button>
          </motion.div>
        )}
        <div className="w-full max-w-[600px]">
          <GlassChatInput onSend={sendMessage} loading={loading} selectedAgent={selected} />
        </div>
      </div>

      {/* Verify modal */}
      <AnimatePresence>
        {showVerifyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setShowVerifyModal(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="relative rounded-2xl px-8 py-6 backdrop-blur-2xl bg-white/[0.05] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_20px_60px_rgba(0,0,0,0.5)] max-w-sm text-center"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">Verification Required</p>
                  <p className="text-white/30 text-xs mt-1">Prove you're human with World ID to hire agents</p>
                </div>
                <button
                  onClick={() => setShowVerifyModal(false)}
                  className="text-white/40 text-xs hover:text-white/60 transition-colors mt-2"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
