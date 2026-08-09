"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronDown } from "lucide-react"
import { PortfolioCompany } from "@/lib/types"
import { CompanyRunway, RUNWAY_BANDS, RUNWAY_COLORS, isActive, runwayBandColor, fmtMonths, median } from "@/lib/runway"
import { fmtMoney, exactDate } from "@/lib/rounds"
import PortfolioCompanyDetail from "@/components/portfolio/PortfolioCompanyDetail"
import { useServerState } from "@/lib/useServerState"

// Only navy is used directly, for the cash figure. Every verdict colour comes
// from runwayBandColor so the tiles and the rows can't diverge.
const { navy: NAVY } = RUNWAY_COLORS

// Runway across the portfolio: cash on hand, monthly burn, and when each company
// runs out.
//
// Ordered by urgency rather than alphabetically — this is a queue of who needs
// attention, not a table you read across, and whoever is closest to zero belongs
// at the top whatever their name. That ordering IS the alert; there's
// deliberately no separate warning bar duplicating the top few rows.
export default function RunwayView({
  initial, companies,
}: {
  initial: CompanyRunway[]
  companies: PortfolioCompany[]
}) {
  const router = useRouter()
  // The server is the source of truth here — nothing on this page mutates the
  // rows locally. It used to be `useState(initial)`, which snapshots the prop at
  // mount and IGNORES every later one, so the router.refresh() fired when the
  // company modal closes changed nothing on screen: a flag cleared inside the
  // modal kept its badge in the table until a full page reload. A useState with
  // no setter cannot do anything except go stale.
  const rows = initial
  const [openId, setOpenId] = useState<string | null>(null)
  // Resets when the server sends new data, unlike `rows` above which needs no
  // state at all because nothing here mutates it locally.
  const [comps, setComps] = useServerState(companies)
  const [showWoundDown, setShowWoundDown] = useState(false)
  // Collapsed by default — see the group header in the table below.
  const [showNoData, setShowNoData] = useState(false)

  // Three groups, in the order they deserve attention. A company with no cash
  // data is a gap in OUR coverage, so it stays visible — but muted and below the
  // companies that have figures, so a blank row never pushes an urgent one down.
  const live = rows.filter((r) => isActive(r.status) && r.snapshotCount > 0)
  const noData = rows.filter((r) => isActive(r.status) && r.snapshotCount === 0)
  // Wound down but carrying recorded figures. Runway doesn't apply to them, so
  // they're collapsed away — but never dropped, because data already entered
  // must not become invisible.
  const woundDown = rows.filter((r) => !isActive(r.status))

  const activeCount = comps.filter((c) => isActive(c.status)).length
  const withCash = live.filter((r) => r.cashOnHand != null)
  // Oldest balance on the book — the single most useful warning about how much
  // any of this can be trusted.
  const oldest = withCash.reduce<string | null>((o, r) => (!o || (r.asOf && r.asOf < o) ? r.asOf : o), null)
  // Half the book has less than this. Deliberately NOT a total: cash and burn
  // can't be summed across companies (different dates, and one company's cash
  // can't fund another's burn), and the old totals covered different subsets of
  // companies, so dividing one by the other — the obvious thing to do with two
  // adjacent tiles — gave a portfolio runway that meant nothing.
  const medianMonths = median(live.map((r) => r.monthsLeft))
  const withRunway = live.filter((r) => r.monthsLeft != null)
  const staleRows = live.filter((r) => r.stale)
  const flagged = live.filter((r) => r.mismatchPct != null)
  const urgent = live.filter((r) => r.monthsLeft != null && r.monthsLeft < RUNWAY_BANDS.caution)
  const critical = live.filter((r) => r.monthsLeft != null && r.monthsLeft < RUNWAY_BANDS.critical)
  const lapsed = live.filter((r) => r.monthsLeft != null && r.monthsLeft <= 0)
  // The tile takes its colour from the SAME band rule as the rows, applied to
  // the most urgent company. Picking a colour independently is how a tile ends
  // up amber while red rows sit directly beneath it.
  const worst = live.reduce<number | null>(
    (m, r) => (r.monthsLeft == null ? m : m == null ? r.monthsLeft : Math.min(m, r.monthsLeft)),
    null,
  )

  const openCompany = openId ? comps.find((c) => c.id === openId) : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900" title="Cash on hand, monthly burn, and when each company runs out">
          Runway
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl space-y-6">
          {/* Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile
              label="Companies covered"
              value={`${live.length} / ${activeCount}`}
              sub={noData.length ? `${noData.length} with no cash data` : "all active companies covered"}
            />
            {/* Median, not a total — see the comment on `medianMonths`. Coloured
                through runwayBandColor like every other verdict on the page, so
                the tile can never disagree with the rows beneath it. */}
            <Tile
              label="Median runway"
              value={medianMonths != null ? `${medianMonths.toFixed(1)} mo` : "—"}
              color={medianMonths != null ? runwayBandColor(medianMonths) : undefined}
              sub={
                withRunway.length
                  ? `half of ${withRunway.length} have less`
                  : "no runway figures yet"
              }
            />
            {/* Staleness is the honest data-health measure. The `check` flag is
                NOT counted as a fault — several are legitimate (a burn forecast
                to ramp makes cash ÷ burn disagree with a stated date on purpose)
                — so it's reported alongside rather than added in. */}
            <Tile
              label="Stale balances"
              value={live.length ? String(staleRows.length) : "—"}
              sub={
                oldest
                  ? `oldest ${exactDate(oldest)}${flagged.length ? ` · ${flagged.length} flagged` : ""}`
                  : "nothing reported"
              }
            />
            <Tile
              label={`Under ${RUNWAY_BANDS.caution} months`}
              value={live.length ? String(urgent.length) : "—"}
              color={urgent.length ? runwayBandColor(worst) : undefined}
              sub={
                lapsed.length
                  ? `${lapsed.length} already lapsed`
                  : critical.length
                    ? `${critical.length} under ${RUNWAY_BANDS.critical} months`
                    : "counted from today"
              }
            />
          </div>

          {/* Roster */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-700" title="Soonest out of cash first">
                By urgency
              </p>
              <p className="text-xs text-slate-400">click a company to enter or edit snapshots</p>
            </div>

            {live.length === 0 && noData.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-slate-500">No active portfolio companies.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[940px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <Th>Company</Th>
                      <Th>Balance date</Th>
                      <Th right>Cash on hand</Th>
                      <Th right>Monthly burn</Th>
                      <Th right>Runway</Th>
                      <Th>Out of cash</Th>
                      <Th right>Left today</Th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {live.map((c) => (
                      <Row key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
                    ))}

                    {/* Collapsed by default, matching the wound-down footer and
                        the alert bars elsewhere in the app. The count stays
                        visible while collapsed so the coverage gap is never
                        hidden — only the names are folded away. */}
                    {noData.length > 0 && (
                      <>
                        <tr
                          className="bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer transition"
                          onClick={() => setShowNoData((s) => !s)}
                        >
                          <td colSpan={8} className="px-4 py-1.5">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                              {showNoData ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              No cash data ({noData.length}) — nothing recorded yet, not a company at zero
                            </span>
                          </td>
                        </tr>
                        {showNoData && noData.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setOpenId(c.id)}
                            className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer group"
                          >
                            <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                              {c.name}
                              <ChevronRight className="inline w-3.5 h-3.5 ml-1.5 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                            </td>
                            <td colSpan={6} className="px-4 py-2.5 text-slate-300">no snapshot recorded</td>
                            <td />
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {woundDown.length > 0 && (
              <div className="border-t border-slate-100">
                <button
                  onClick={() => setShowWoundDown((s) => !s)}
                  className="w-full flex items-center gap-1.5 px-4 py-2.5 text-xs text-slate-400 hover:text-slate-600 transition"
                >
                  {showWoundDown ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Wound down ({woundDown.length}) — runway no longer applies, figures kept
                </button>
                {showWoundDown && (
                  <div className="divide-y divide-slate-50 border-t border-slate-100">
                    {woundDown.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setOpenId(c.id)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
                      >
                        <span className="w-48 truncate">{c.name}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100">{c.status}</span>
                        <span className="tabular-nums">{fmtMoney(c.cashOnHand)}</span>
                        <span className="text-slate-300">{c.asOf ? exactDate(c.asOf) : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Runway is counted from the date cash was measured. <strong>Left today</strong> ages that report forward at the
            reported burn rate — an extrapolation, so a stale balance shows as a shrinking figure rather than a
            reassuring one. A company-stated runway is used where a deck gives one, with cash ÷ burn kept as a
            cross-check; a material disagreement is flagged on the company&apos;s own tab. A reported burn of zero
            means the company is covering its costs, not that it has no runway.
          </p>
        </div>
      </div>

      {openCompany && (
        <PortfolioCompanyDetail
          company={openCompany}
          initialTab="runway"
          onClose={() => { setOpenId(null); router.refresh() }}
          onUpdated={(u) => setComps((prev) => prev.map((c) => (c.id === u.id ? u : c)))}
          onDeleted={(id) => {
            setComps((prev) => prev.filter((c) => c.id !== id))
            setOpenId(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Row({ c, onOpen }: { c: CompanyRunway; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer group">
      <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
        {c.name}
        {c.mismatchPct != null && (
          <span
            className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: "#faece7", color: "#993c1d" }}
            title="The stated runway and cash ÷ burn disagree materially — see the company's Runway tab"
          >
            check
          </span>
        )}
        <ChevronRight className="inline w-3.5 h-3.5 ml-1.5 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
      </td>
      {/* An old balance is the thing most likely to mislead, so it's flagged in
          the cell rather than only in the aggregate caption. */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        {c.asOf ? (
          <span
            className={c.stale ? "" : "text-slate-500"}
            style={c.stale ? { color: "#993c1d" } : undefined}
            title={c.staleMonths != null ? `${c.staleMonths.toFixed(1)} months old` : undefined}
          >
            {exactDate(c.asOf)}
            {c.stale && <span className="ml-1.5 text-[11px]">stale</span>}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: c.cashOnHand != null ? NAVY : undefined }}>
        {c.cashOnHand != null ? fmtMoney(c.cashOnHand) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">
        {c.notBurning ? (
          <span className="text-slate-400" title="Reported burn is zero or below — covering its own costs">none</span>
        ) : c.monthlyBurn != null ? (
          // Tooltip carries the cash-movement figure, which is the only burn
          // comparable across companies — the deck figures are on mixed bases.
          <span
            title={[
              c.burnBasis ? `Deck basis: ${c.burnBasis}` : null,
              c.movementBurn == null
                ? "No second cash balance yet, so actual cash movement can't be computed."
                : c.movementUnderstated
                  ? `Cash movement implies only ${fmtMoney(c.movementBurn)}/mo (${c.movementBasis}) — capital came in over that window, so it is NOT comparable. Use the reported burn.`
                  : `Actual cash movement: ${fmtMoney(c.movementBurn)}/mo (${c.movementBasis})`,
            ].filter(Boolean).join("\n")}
          >
            {fmtMoney(c.monthlyBurn)}
            {c.burnTrendPct != null && (
              <span className="text-slate-300 ml-1 text-xs">
                {c.burnTrendPct > 0 ? "↑" : "↓"}{Math.abs(c.burnTrendPct).toFixed(0)}%
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      {/* Runway as at the balance date, tagged with where it came from. */}
      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: runwayBandColor(c.runwayMonths) }}>
        {c.runwayMonths != null ? (
          <span
            title={
              c.runwayBasis === "stated"
                ? c.derivedMonths != null
                  ? `Company-stated. Cash ÷ burn gives ${fmtMonths(c.derivedMonths)}.`
                  : "Company-stated."
                : "Derived: cash ÷ burn."
            }
          >
            {fmtMonths(c.runwayMonths)}
            <span className="text-slate-300 ml-1 text-xs">{c.runwayBasis === "stated" ? "stated" : "calc"}</span>
            {/* Runway can be a different vintage from the cash figure. Say so,
                or the balance date column silently mislabels it. */}
            {c.runwayAsOf && c.runwayAsOf !== c.asOf && (
              <span className="text-slate-300 ml-1 text-xs" title={`Runway stated as of ${exactDate(c.runwayAsOf)}, cash as of ${exactDate(c.asOf ?? "")}`}>
                @{exactDate(c.runwayAsOf)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums" style={{ color: runwayBandColor(c.monthsLeft) }}>
        {c.outOfCash ? exactDate(c.outOfCash) : <span className="text-slate-300">—</span>}
      </td>
      {/* The actionable column: months left counted from today, not from the
          balance date. Negative reads as "lapsed", never as a negative number. */}
      <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: runwayBandColor(c.monthsLeft) }}>
        {c.monthsLeft == null ? (
          <span className="text-slate-300">—</span>
        ) : c.monthsLeft <= 0 ? (
          <span title={`Lapsed ${Math.abs(c.monthsLeft).toFixed(1)} months ago on the last reported burn`}>lapsed</span>
        ) : (
          fmtMonths(c.monthsLeft)
        )}
      </td>
      <td />
    </tr>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`${right ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap`}>
      {children}
    </th>
  )
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: color ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
