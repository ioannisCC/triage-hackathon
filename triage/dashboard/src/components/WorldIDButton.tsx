import { useState, useCallback } from 'react'
import { IDKitRequestWidget, deviceLegacy } from '@worldcoin/idkit'
import type { IDKitRequestHookConfig, IDKitResult } from '@worldcoin/idkit'
import { API_URL } from '../config'

const APP_ID = 'app_7d1c626d5f999f278a30144020444544' as const
const ACTION = 'triage-verify'

export function WorldIDButton({ onVerified }: { onVerified: (humanId: string) => void }) {
  const [verified, setVerified] = useState(false)
  const [open, setOpen] = useState(false)
  const [rpContext, setRpContext] = useState<IDKitRequestHookConfig['rp_context'] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/idkit/rp-context`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to get rp_context')
      const ctx = await res.json()
      setRpContext(ctx)
      setOpen(true)
    } catch (err) {
      console.error('[WorldID] Failed to init:', err)
    }
    setLoading(false)
  }, [])

  const handleSuccess = useCallback(async (result: IDKitResult) => {
    try {
      const res = await fetch(`${API_URL}/api/verify-human`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      const data = await res.json() as { success: boolean; humanId?: string }
      if (data.success && data.humanId) {
        setVerified(true)
        onVerified(data.humanId)
      }
    } catch (err) {
      console.error('[WorldID] Verification error:', err)
    }
  }, [onVerified])

  if (verified) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span className="text-[11px] text-green-400/90 font-medium">Human Verified</span>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-3.5 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all bg-white/[0.06] text-white/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/[0.09] hover:text-white/90"
      >
        {loading ? 'Loading...' : 'Verify with World ID'}
      </button>

      {rpContext && (
        <IDKitRequestWidget
          app_id={APP_ID}
          action={ACTION}
          rp_context={rpContext}
          preset={deviceLegacy()}
          allow_legacy_proofs={true}
          open={open}
          onOpenChange={setOpen}
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}
