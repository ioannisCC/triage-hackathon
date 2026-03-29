import type { ReactNode } from 'react'

export function Card({ children, className = '', noPad }: {
  children: ReactNode
  className?: string
  noPad?: boolean
}) {
  return (
    <div className={`card ${className}`}>
      <div className={`relative z-10 h-full ${noPad ? '' : 'px-5 py-4'} ${
        className.includes('flex') ? 'flex flex-col' : ''
      }`}>
        {children}
      </div>
    </div>
  )
}
