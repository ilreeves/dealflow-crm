import type { ReactNode } from 'react'

// The one page header every dashboard page uses. Before this, each page rolled
// its own: two used a larger title, some showed a count under the title while
// others hid their description in a hover tooltip, and Settings sat in a narrow
// centred column with the title inside the content. One component keeps the
// height, padding, border and type scale identical, so moving between tabs no
// longer feels like moving between apps.
//
// Deliberately `shrink-0` and nothing else about scrolling: every page owns its
// own scroll container BELOW this header (most are `flex flex-col h-full` with
// an inner `flex-1 overflow-y-auto`), and the header just has to not collapse
// inside that column. It must never become a scroller itself.
export default function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  /** One short, visible line under the title — a count or a plain description. */
  subtitle?: ReactNode
  /** Right-aligned controls: view toggles, search, primary "Add" button. */
  actions?: ReactNode
  /** Optional second row (e.g. filter tabs) that spans the full header width. */
  children?: ReactNode
}) {
  return (
    // px-4 on phones, px-6 from md up — pages match this on their content
    // area so the title and the first card line up on the same left edge.
    <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 shrink-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* The title keeps its natural width (shrink-0) so it is never squeezed
            to "Pipel…" by a wide toolbar — the ACTIONS wrap instead. Capped at
            half the row when there are actions, so a long subtitle truncates
            rather than pushing them off the edge. */}
        <div className={`min-w-0 shrink-0 ${actions ? 'sm:max-w-[50%]' : ''}`}>
          <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 md:truncate">{subtitle}</p>}
        </div>
        {actions && <div className="min-w-0 flex flex-wrap items-center sm:justify-end gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
