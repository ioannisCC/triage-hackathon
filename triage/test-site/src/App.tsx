import { useState, useEffect, useCallback } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import { IDKitRequestWidget, deviceLegacy } from '@worldcoin/idkit'
import type { IDKitRequestHookConfig, IDKitResult } from '@worldcoin/idkit'

const LIVE = 'https://triage-hackathon-production.up.railway.app'
const APP_ID = 'app_7d1c626d5f999f278a30144020444544' as const
const BASE = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

const TIER: Record<string, { color: string; label: string }> = {
  HUMAN: { color: '#36d068', label: 'Human' },
  HUMAN_AGENT: { color: '#4a91f7', label: 'Agent' },
  ANON_BOT: { color: '#f0a020', label: 'Bot' },
  BLOCKED: { color: '#ee5555', label: 'Blocked' },
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) }}
      style={{ flexShrink: 0, padding: 6, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
      {ok
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#36d068" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
    </button>
  )
}

export default function App() {
  const [verified, setVerified] = useState(false)
  const [humanId, setHumanId] = useState<string | null>(null)
  const [result, setResult] = useState<{ tier: string; trustScore: number; roast: string; price: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [idkitOpen, setIdkitOpen] = useState(false)
  const [rpContext, setRpContext] = useState<IDKitRequestHookConfig['rp_context'] | null>(null)
  const [idkitLoading, setIdkitLoading] = useState(false)

  const openWorldId = useCallback(async () => {
    setIdkitLoading(true)
    try {
      const res = await fetch('/triage/verify-context', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to get rp_context')
      const ctx = await res.json()
      setRpContext(ctx)
      setIdkitOpen(true)
    } catch (err) {
      console.error('[WorldID] Failed to init:', err)
    }
    setIdkitLoading(false)
  }, [])

  const handleWorldIdSuccess = useCallback(async (result: IDKitResult) => {
    try {
      const res = await fetch('/triage/verify-human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      const data = await res.json() as { success: boolean; humanId?: string }
      if (data.success) {
        setHumanId(data.humanId || null)
        setVerified(true)
      }
    } catch (err) {
      console.error('[WorldID] Verification error:', err)
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const roast = async () => {
    setLoading(true)
    try {
      const h: Record<string, string> = {}
      if (verified && humanId) h['x-world-id'] = humanId
      const r = await fetch('/api/roast', { headers: h })
      const data = await r.json()

      if (r.status === 200) {
        setResult(data)
      } else if (r.status === 402) {
        setResult({
          tier: data.triage?.tier || 'ANON_BOT',
          trustScore: data.triage?.trustScore || 0,
          roast: 'Payment required. You need USDC on Base Sepolia to access this API.',
          price: data.triage?.price ? `$${data.triage.price}` : '$0.007',
        })
      } else {
        setResult({
          tier: data.tier || 'BLOCKED',
          trustScore: 0,
          roast: data.error || 'No identity. No wallet. No access. Try being someone first.',
          price: 'DENIED',
        })
      }
    } catch { setResult({ tier: 'BLOCKED', trustScore: 0, roast: 'Error connecting to server.', price: 'N/A' }) }
    setLoading(false)
  }

  const t = result ? TIER[result.tier] || TIER.BLOCKED : null

  return (
    <>
      <MeshGradient
        className="!fixed inset-0 w-full h-full z-0"
        style={{ position: 'fixed' }}
        colors={['#000000', '#1a1a1a', '#333333', '#ffffff']}
        speed={0.12}
      />

      {/* Noise overlay — dithering to kill dark gradient banding */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, opacity: 0.12, pointerEvents: 'none', mixBlendMode: 'overlay', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 1024 1024' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: 'repeat', backgroundSize: '512px 512px' }} />

      <div style={{ position: 'relative', zIndex: 10 }}>

        {/* ── HERO ── */}
        <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px', textAlign: 'center', position: 'relative' }}>
          <h1 style={{ fontSize: 'clamp(48px, 8vw, 72px)', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to bottom, white, rgba(255,255,255,0.4))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 20 }}>
            The Roaster
          </h1>
          <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>AI agents pay to roast you. Humans roast free.</p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', marginBottom: 48 }}>Your identity determines your price. Prove you're human or pay up.</p>

          {verified ? (
            <div className="glass" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 999 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#36d068" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              <span style={{ fontSize: 14, color: 'rgba(54,208,104,0.9)', fontWeight: 500 }}>Human Verified</span>
            </div>
          ) : (
            <>
              <button onClick={openWorldId} disabled={idkitLoading} className="glass"
                style={{ padding: '14px 28px', borderRadius: 999, color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: idkitLoading ? 0.5 : 1 }}>
                {idkitLoading ? 'Loading...' : 'Verify with World ID'}
              </button>
              {rpContext && (
                <IDKitRequestWidget
                  app_id={APP_ID}
                  action="triage-verify"
                  rp_context={rpContext}
                  preset={deviceLegacy()}
                  allow_legacy_proofs={true}
                  open={idkitOpen}
                  onOpenChange={setIdkitOpen}
                  onSuccess={handleWorldIdSuccess}
                />
              )}
            </>
          )}
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>
            {verified ? 'You unlocked free access. Brace yourself.' : 'Verify to unlock free HUMAN tier access'}
          </p>

          <a href={`${BASE}/triage`} target="_blank" rel="noopener" className="glass"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 999, marginTop: 24, color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            View Live Dashboard →
          </a>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>Watch requests classified in real-time</p>

          {/* Scroll indicator — fades out on scroll */}
          <div style={{
            position: 'absolute', bottom: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            opacity: scrolled ? 0 : 1, transition: 'opacity 0.6s ease', pointerEvents: scrolled ? 'none' : 'auto',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>scroll</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" className="animate-bounce">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </div>
        </section>

        {/* ── TRY IT ── */}
        <section style={{ padding: '96px 20px', display: 'flex', justifyContent: 'center' }}>
          <div className="glass" style={{ borderRadius: 20, padding: 32, maxWidth: 672, width: '100%', textAlign: 'center' }}>
            <button onClick={roast} disabled={loading} className="glass"
              style={{ padding: '12px 32px', borderRadius: 999, color: 'rgba(255,255,255,0.8)', fontWeight: 500, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Roasting...' : 'Get Roasted'}
            </button>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>The Roaster judges your identity tier and delivers a verdict</p>

            {result && t && (
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 24, marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: t.color, boxShadow: `0 0 8px ${t.color}66` }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: t.color }}>{t.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Trust: {result.trustScore}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{result.price}</span>
                </div>
                <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 1.6 }}>"{result.roast}"</p>
              </div>
            )}

            <div style={{ marginTop: 32, textAlign: 'left' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>Try via curl</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { dot: '#ee5555', label: 'Blocked', cmd: `curl ${BASE}/api/roast` },
                  { dot: '#f0a020', label: 'Bot', cmd: `curl -H "x-agent-address: 0xBOT1234" ${BASE}/api/roast` },
                  { dot: '#4a91f7', label: 'Agent', cmd: `curl -H "x-agentkit-demo: human-backed" -H "x-agent-address: 0xAGENT" ${BASE}/api/roast` },
                ].map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', width: 56, flexShrink: 0 }}>{c.label}</span>
                    <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cmd}</code>
                    <CopyBtn text={c.cmd} />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ── BUILT WITH ── */}
        <section style={{ padding: '96px 20px', display: 'flex', justifyContent: 'center' }}>
          <div className="glass" style={{ borderRadius: 20, padding: 32, maxWidth: 672, width: '100%', textAlign: 'center' }}>
            <h2 style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>Built with triage-middleware</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', marginBottom: 32 }}>The trust layer protecting this API</p>

            <div style={{ position: 'relative', background: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 24, textAlign: 'left', overflow: 'auto' }}>
              <div style={{ position: 'absolute', top: 12, right: 12 }}><CopyBtn text={`npm install triage-middleware\n\nimport { Hono } from 'hono'\nimport { triage } from 'triage-middleware'\n\nconst app = new Hono()\napp.use('/api/*', triage({ payTo: '0xYourWallet' }))`} /></div>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, whiteSpace: 'pre', margin: 0 }}>{`npm install triage-middleware

import { Hono } from 'hono'
import { triage } from 'triage-middleware'

const app = new Hono()
app.use('/api/*', triage({ payTo: '0xYourWallet' }))

// Humans: free. Agents: trust-scored. Bots: full price.`}</pre>
            </div>

            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 32 }}>
              {[
                { label: 'npm', href: 'https://www.npmjs.com/package/triage-middleware' },
                { label: 'dashboard', href: LIVE },
                { label: 'github', href: 'https://github.com/ioannisCC/triage-hackathon' },
              ].map(l => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener"
                  style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>{l.label}</a>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Powered by Triage · Built for AgentKit Hackathon by World, Coinbase & XMTP</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>Ioan Croitor Catargiu · Athens · 2026</p>
        </footer>
      </div>
    </>
  )
}
