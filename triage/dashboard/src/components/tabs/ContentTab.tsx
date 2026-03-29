import { useState } from 'react'
import type { TriageEvent } from '../../types'
import { ArticleList } from '../content/ArticleList'
import { ArticleView } from '../content/ArticleView'
import { RevenuePanel } from '../content/RevenuePanel'

export function ContentTab({ events, isVerified }: { events: TriageEvent[]; isVerified: boolean }) {
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-hidden flex flex-col w-full max-w-[1100px] mx-auto px-4 pt-10 pb-6 gap-6">
      {/* Title — outside the grid so both columns align */}
      {!selectedArticle && (
        <div className="shrink-0">
          <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40">
            Creator Content
          </h1>
          <p className="text-sm text-white/30 mt-2">Content monetization powered by Triage</p>
        </div>
      )}

      <div className="grid gap-4 flex-1 min-h-0" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
        {/* Left: Articles */}
        <div className="overflow-y-auto scrollbar-hide">
          {selectedArticle ? (
            <ArticleView id={selectedArticle} isVerified={isVerified} onBack={() => setSelectedArticle(null)} />
          ) : (
            <ArticleList onSelect={setSelectedArticle} />
          )}
        </div>

        {/* Right: Revenue */}
        <div className="overflow-y-auto scrollbar-hide">
          <RevenuePanel events={events} />
        </div>
      </div>
    </div>
  )
}
