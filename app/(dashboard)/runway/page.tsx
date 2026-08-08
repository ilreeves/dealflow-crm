import { createClient } from "@/lib/supabase/server"
import { PortfolioCompany, PortfolioCash } from "@/lib/types"
import { buildCompanyRunway } from "@/lib/runway"
import RunwayView from "@/components/runway/RunwayView"

export const dynamic = "force-dynamic"

export default async function RunwayPage() {
  const supabase = await createClient()
  const [{ data: companies }, { data: cash }] = await Promise.all([
    supabase.from("portfolio_companies").select("*").order("name"),
    // Newest-first is what the helpers in lib/runway expect.
    supabase.from("portfolio_cash").select("*").order("as_of", { ascending: false }),
  ])

  const comps = (companies as PortfolioCompany[]) ?? []
  const rows = (cash as PortfolioCash[]) ?? []

  return <RunwayView initial={buildCompanyRunway(comps, rows)} companies={comps} />
}
