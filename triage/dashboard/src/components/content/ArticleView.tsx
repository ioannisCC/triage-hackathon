import { useEffect, useState } from 'react'
import type { Article } from '../../types'
import { API_URL } from '../../config'

const API = API_URL

export function ArticleView({ id, isVerified, onBack }: {
  id: string; isVerified: boolean; onBack: () => void
}) {
  const [article, setArticle] = useState<Article | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<string>('')
  const [price, setPrice] = useState<string>('')

  useEffect(() => {
    const headers: Record<string, string> = {}
    if (isVerified) headers['x-world-id'] = 'verified'

    fetch(`${API}/api/content/${id}`, { headers })
      .then(async res => {
        setTier(res.headers.get('X-Triage-Tier') || '')
        if (res.status === 403) { setError('Access denied. Verify with World ID to read for free.'); return }
        if (res.status === 402) { setError('Payment required. Verify with World ID to read for free.'); return }
        const data = await res.json()
        setArticle(data)
        setPrice(res.headers.get('X-Triage-Tier') === 'HUMAN' ? 'Free' : `Score: ${res.headers.get('X-Triage-Trust-Score')}`)
      })
      .catch(() => setError('Failed to load article'))
  }, [id, isVerified])

  return (
    <div>
      <button onClick={onBack} className="text-sm text-white/40 hover:text-white/60 mb-4 inline-block transition-colors">
        ← Back to articles
      </button>
      <div className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-1px_0_0_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <div className="relative z-10 px-6 py-5">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-400/80 text-sm mb-2">{error}</p>
              <p className="text-white/25 text-[11px]">Agents pay $0.001–$0.01 via x402</p>
            </div>
          ) : article ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">{article.category}</span>
                <span className="text-[10px] text-white/15">·</span>
                <span className="text-[10px] text-white/20">{article.publishedAt}</span>
              </div>
              <h1 className="text-lg font-medium text-white/90 mb-2">{article.title}</h1>
              <p className="text-xs text-white/30 mb-6">By {article.author}</p>
              <div className="text-white/60 leading-relaxed text-sm">
                {article.content?.split('. ').map((s, i) => (
                  <span key={i}>{i > 0 ? '. ' : ''}{s}{i > 0 && i % 3 === 0 ? <><br /><br /></> : ''}</span>
                ))}
              </div>
              {tier && (
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-3 text-[11px] text-white/30">
                  <span className="font-mono">Tier: <span className="text-green-400/70 font-semibold">{tier}</span></span>
                  <span className="font-mono">Price: <span className="text-green-400/70 font-semibold">{price}</span></span>
                </div>
              )}
            </>
          ) : (
            <p className="text-white/30 text-sm text-center py-8">Loading...</p>
          )}
        </div>
      </div>
    </div>
  )
}
