import { createClient } from "@/lib/supabase/server"
import { rowsOrThrow } from "@/lib/supabase/unwrap"
import { PortfolioCompany, PortfolioRevenue } from "@/lib/types"
import { buildCompanyRevenue } from "@/lib/revenue"
import RevenueView from "@/components/revenue/RevenueView"

export const dynamic = "force-dynamic"

export default async function RevenuePage() {
  const supabase = await createClient()
  const [companiesRes, revenueRes] = await Promise.all([
    supabase.from("portfolio_companies").select("*").order("name"),
    // Newest-first is what the roll-up helpers in lib/revenue expect.
    supabase.from("portfolio_revenue").select("*").order("period_end", { ascending: false }),
  ])

  const comps = rowsOrThrow(companiesRes, "portfolio companies") as PortfolioCompany[]
  const rows = rowsOrThrow(revenueRes, "revenue history") as PortfolioRevenue[]
  const fiscalYear = new Date().getFullYear()

  return (
    <RevenueView
      initial={buildCompanyRevenue(comps, rows, fiscalYear)}
      companies={comps}
      fiscalYear={fiscalYear}
    />
  )
}
