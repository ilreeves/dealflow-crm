'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

// A (?) that reveals an explanation on hover, focus, or tap. The CRM's
// methodology notes ("TVPI = total value ÷ invested…", "whole ≥ is the
// smallest exit…") are worth keeping but crowded every page they sat on as
// always-visible paragraphs; this keeps them one hover away.
//
// The bubble is portalled to <body> with fixed positioning because most of
// these sit inside scroll containers (the company modal, the page's own
// overflow-y-auto column) that would otherwise clip it.

const WIDTH = 288 // px — w-72; wide enough for a short paragraph
const GAP = 6

export default function InfoTip({
  children,
  label = 'More info',
  className,
  size = 'sm',
}: {
  /** The explanation. Plain text or light markup. */
  children: React.ReactNode
  /** Accessible name for the trigger. */
  label?: string
  className?: string
  size?: 'xs' | 'sm'
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const open = hover || pinned

  // Measure after open so the bubble lands next to the trigger even when the
  // page has scrolled; flip above when there's no room below.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect()
      const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)
      const above = r.bottom + 160 > window.innerHeight && r.top > 160
      setPos({ top: above ? r.top - GAP : r.bottom + GAP, left, above })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // A tapped-open tip closes on the next outside tap or Escape.
  useLayoutEffect(() => {
    if (!pinned) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && triggerRef.current?.contains(e.target as Node)) return
      setPinned(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [pinned])

  const icon = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        // Don't let a tip inside a clickable row (a collapsible header, a
        // table row that opens a modal) trigger the row too.
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPinned((p) => !p) }}
        className={cn('inline-flex items-center align-middle text-slate-300 hover:text-slate-500 focus:outline-none focus-visible:text-slate-500 transition', className)}
      >
        <CircleHelp className={icon} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}
          className="z-[200] rounded-lg bg-slate-900 text-slate-100 text-xs leading-relaxed px-3 py-2 shadow-lg pointer-events-none"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
