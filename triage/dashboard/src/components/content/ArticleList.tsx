import { useEffect, useState } from 'react'
import type { Article } from '../../types'
import { API_URL } from '../../config'

const API = API_URL

export function ArticleList({ onSelect }: { onSelect: (id: string) => void }) {
  const [articles, setArticles] = useState<Article[]>([])

  useEffect(() => {
    fetch(`${API}/api/content`)
      .then(r => r.json())
      .then(setArticles)
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-3">
      {articles.map(a => (
        <div
          key={a.id}
          onClick={() => onSelect(a.id)}
          className="relative rounded-2xl overflow-hidden backdrop-blur-2xl bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),inset_0_-1px_0_0_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.3)] cursor-pointer transition-all duration-300 hover:bg-white/[0.06] hover:translate-y-[-2px] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_40px_rgba(0,0,0,0.4)]"
        >
          {/* Glass gradient overlay */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
          <div className="relative z-10 px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">{a.category}</span>
              <span className="text-[10px] text-white/15">·</span>
              <span className="text-[10px] text-white/20">{a.publishedAt}</span>
            </div>
            <h3 className="text-sm font-medium text-white/85 mb-1">{a.title}</h3>
            <p className="text-xs text-white/40 mb-3 leading-relaxed">{a.summary}</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/25">By {a.author}</span>
              <span className="text-[11px] font-medium text-white/50 hover:text-white/70 transition-colors">
                Read Article →
              </span>
            </div>
          </div>
        </div>
      ))}
      {articles.length === 0 && <p className="text-white/30 text-sm text-center py-8">Loading articles...</p>}
    </div>
  )
}
