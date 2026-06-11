'use client'

import { Catalyst } from '@/lib/types'

interface Props {
  catalysts: Catalyst[]
}

const STATUS_BAR: Record<string, string> = {
  'Pending':    'bg-yellow-400',
  'On Track':   'bg-emerald-500',
  'Done':       'bg-green-500',
  'Delayed':    'bg-orange-500',
  'On Hold':    'bg-slate-400',
  'Failed':     'bg-red-500',
  'Terminated': 'bg-red-700',
}

// Quarter span within a year: [startQuarter (0-3), quarterCount]
function periodSpan(c: Catalyst): { year: number; startQ: number; span: number } {
  const year = parseInt(c.catalyst_date.slice(0, 4), 10)
  if (c.period) {
    const p = c.period.split(' ')[0]
    switch (p) {
      case '1Q': return { year, startQ: 0, span: 1 }
      case '2Q': return { year, startQ: 1, span: 1 }
      case '3Q': return { year, startQ: 2, span: 1 }
      case '4Q': return { year, startQ: 3, span: 1 }
      case '1H': return { year, startQ: 0, span: 2 }
      case '2H': return { year, startQ: 2, span: 2 }
      default:   return { year, startQ: 0, span: 4 } // FY
    }
  }
  const month = parseInt(c.catalyst_date.slice(5, 7), 10)
  return { year, startQ: Math.floor((month - 1) / 3), span: 1 }
}

const QUARTER_W = 48  // px per quarter
const LABEL_W = 260   // px for the catalyst label column

export default function CatalystGantt({ catalysts }: Props) {
  if (catalysts.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No catalysts to chart.</p>
  }

  const years = catalysts.map((c) => parseInt(c.catalyst_date.slice(0, 4), 10))
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const yearCount = maxYear - minYear + 1
  const totalQuarters = yearCount * 4

  const now = new Date()
  const nowQ = (now.getFullYear() - minYear) * 4 + Math.floor(now.getMonth() / 3)

  // Group by company, keep chronological order within each
  const companies: { name: string; items: Catalyst[] }[] = []
  for (const c of [...catalysts].sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date))) {
    let group = companies.find((g) => g.name === c.company_name)
    if (!group) {
      group = { name: c.company_name, items: [] }
      companies.push(group)
    }
    group.items.push(c)
  }
  companies.sort((a, b) => a.name.localeCompare(b.name))

  const chartWidth = LABEL_W + totalQuarters * QUARTER_W

  return (
    <div className="overflow-x-auto pb-4">
      <div style={{ width: chartWidth, minWidth: chartWidth }}>

        {/* Year + quarter headers */}
        <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
          <div style={{ width: LABEL_W }} className="shrink-0" />
          {Array.from({ length: yearCount }, (_, y) => (
            <div key={y} style={{ width: QUARTER_W * 4 }} className="shrink-0 border-l border-slate-200">
              <p className="text-xs font-semibold text-slate-600 text-center py-1">{minYear + y}</p>
              <div className="flex">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                  <span key={q} style={{ width: QUARTER_W }} className="text-center text-[10px] text-slate-400 pb-1">{q}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {companies.map(({ name, items }) => (
          <div key={name}>
            <div className="flex items-center bg-slate-50 border-b border-slate-100">
              <p style={{ width: LABEL_W }} className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">{name}</p>
              <div className="flex-1 h-7 relative">
                <GridLines totalQuarters={totalQuarters} nowQ={nowQ} />
              </div>
            </div>
            {items.map((c) => {
              const { year, startQ, span } = periodSpan(c)
              const offset = (year - minYear) * 4 + startQ
              const status = c.status ?? 'Pending'
              return (
                <div key={c.id} className="flex items-center border-b border-slate-50 hover:bg-slate-50/50 group">
                  <p
                    style={{ width: LABEL_W }}
                    className="shrink-0 px-3 py-1.5 text-xs text-slate-600 truncate"
                    title={`${c.title}${c.notes ? ' — ' + c.notes : ''}`}
                  >
                    {c.title}
                  </p>
                  <div className="flex-1 h-7 relative">
                    <GridLines totalQuarters={totalQuarters} nowQ={nowQ} />
                    <div
                      title={`${c.period ?? c.catalyst_date} — ${status}${c.notes ? '\n' + c.notes : ''}`}
                      className={`absolute top-1 h-5 rounded ${STATUS_BAR[status] ?? 'bg-slate-300'} opacity-90`}
                      style={{ left: offset * QUARTER_W + 2, width: span * QUARTER_W - 4 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 px-3 flex-wrap">
          {Object.entries(STATUS_BAR).map(([label, cls]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`inline-block w-3 h-3 rounded ${cls}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function GridLines({ totalQuarters, nowQ }: { totalQuarters: number; nowQ: number }) {
  return (
    <div className="absolute inset-0 flex pointer-events-none">
      {Array.from({ length: totalQuarters }, (_, i) => (
        <span
          key={i}
          style={{ width: QUARTER_W }}
          className={`shrink-0 h-full ${i % 4 === 0 ? 'border-l border-slate-200' : 'border-l border-slate-100'} ${
            i === nowQ ? 'bg-blue-50' : ''
          }`}
        />
      ))}
    </div>
  )
}
