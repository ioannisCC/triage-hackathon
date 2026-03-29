import { useState, useEffect, useRef } from 'react'

export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export function easeOut3(t: number) {
  return 1 - Math.pow(1 - Math.min(t, 1), 3)
}

export function relTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
}

export function trunc(a = '') {
  if (a.startsWith('0x') && a.length > 18) return a.slice(0, 10) + '\u2026' + a.slice(-4)
  return a.length > 16 ? a.slice(0, 14) + '\u2026' : a
}

export function useSplitFlap(target: number, isFloat = false): [number, number[]] {
  const [display, setDisplay] = useState(target)
  const [flipping, setFlipping] = useState<number[]>([])
  const prevRef = useRef(target)
  const raf = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return
    prevRef.current = to

    const fromStr = isFloat ? from.toFixed(2) : String(Math.round(from))
    const toStr = isFloat ? to.toFixed(2) : String(Math.round(to))
    const maxLen = Math.max(fromStr.length, toStr.length)
    const changed: number[] = []
    for (let i = 0; i < maxLen; i++) {
      if ((fromStr[fromStr.length - 1 - i] || '0') !== (toStr[toStr.length - 1 - i] || '0')) {
        changed.push(i)
      }
    }
    if (changed.length) setFlipping(changed)

    const dur = 280
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const tick = (now: number) => {
      const p = (now - t0) / dur
      setDisplay(from + (to - from) * easeOut3(p))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else { setDisplay(to); setFlipping([]) }
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, isFloat])

  return [display, flipping]
}
