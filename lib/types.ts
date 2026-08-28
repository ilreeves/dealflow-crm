export type DealStage =
  | 'Sourced'
  | 'Science Committee'
  | 'Finance Committee'
  | 'Investment Committee'
  | 'Term Sheet'
  | 'Invested'
  | 'Passed'

export const DEAL_STAGES: DealStage[] = [
  'Passed',
  'Sourced',
  'Science Committee',
  'Finance Committee',
  'Investment Committee',
  'Term Sheet',
  'Invested',
]

export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; border: string }> = {
  'Sourced':               { bg: 'bg-slate-100',   text: 'text-slate-700',  border: 'border-slate-300' },
  'Science Committee':     { bg: 'bg-purple-100',  text: 'text-purple-700', border: 'border-purple-300' },
  'Finance Committee':     { bg: 'bg-pink-100',    text: 'text-pink-700',   border: 'border-pink-300' },
  'Investment Committee':  { bg: 'bg-orange-100',  text: 'text-orange-700', border: 'border-orange-300' },
  'Term Sheet':            { bg: 'bg-yellow-100',  text: 'text-yellow-700', border: 'border-yellow-300' },
  'Invested':              { bg: 'bg-green-100',   text: 'text-green-700',  border: 'border-green-300' },
  'Passed':                { bg: 'bg-red-100',     text: 'text-red-700',    border: 'border-red-300' },
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean'

export interface CustomFieldDefinition {
  id: string
  name: string
  label: string
  field_type: CustomFieldType
  options?: string[]
  required: boolean
  sort_order: number
  created_at: string
}

export interface Deal {
  id: string
  name: string
  stage: DealStage
  sector: string | null
  check_size: string | null
  clinical_stage: string | null
  lead_partner: string | null
  founders: string | null
  source: string | null
  website: string | null
  contact_email: string | null
  description: string | null
  category: 'Devices' | 'Drugs' | null
  country: string | null
  state: string | null
  city: string | null
  current_fundraise: string | null
  fundraising_to_date: string | null
  series: string | null
  current_valuation: string | null
  sharepoint_link: string | null
  drug_names: string | null
  ct_sponsor_name: string | null
  indication: string | null
  custom_fields: Record<string, unknown>
  /** Did the pitch come to us (inbound) or did we source it? NULL = not yet classified. */
  inbound: boolean | null
  stage_entered_at: string | null
  pass_reason: string | null
  passed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DealActivity {
  id: string
  deal_id: string | null
  deal_name: string
  action: string
  details: string | null
  actor_name: string | null
  created_at: string
}

export interface DealFile {
  id: string
  deal_id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

/** A portfolio company's documents. Mirrors DealFile; see migration_portfolio_files.sql. */
export interface PortfolioFile {
  id: string
  company_id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

/**
 * The shape the files UI actually renders — a deal file, a portfolio file, or a
 * non-con deck listed alongside them.
 *
 * `deck` entries are read from company_decks and are NOT rows in a files table.
 * They carry no delete affordance here: a deck holds a public share token an
 * outside investor may be using, and a second delete path would let the files
 * list silently 404 a live link.
 */
export interface StoredFile {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  created_at: string
  /** Set when this row came from company_decks — carries the deck's label. */
  deckLabel?: string
}

export interface DealNote {
  id: string
  deal_id: string
  content: string
  author_id: string | null
  author_name: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  updated_at: string
}

// ─── Deal Meetings ────────────────────────────────────────────────────────────

export interface DealMeeting {
  id: string
  deal_id: string
  title: string
  meeting_date: string | null
  attendees: string | null
  summary: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MeetingNote {
  id: string
  meeting_id: string
  content: string
  author_id: string | null
  author_name: string | null
  created_at: string
  updated_at: string
}

export interface MeetingFile {
  id: string
  meeting_id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface PortfolioCompany {
  id: string
  name: string
  sector: string | null
  category: 'Devices' | 'Drugs' | null
  status: string | null
  funds: string[] | null
  series: string | null
  clinical_stage: string | null
  country: string | null
  state: string | null
  city: string | null
  website: string | null
  contact_email: string | null
  description: string | null
  current_valuation: string | null
  current_fundraise: string | null
  sharepoint_link: string | null
  drug_names: string | null
  ct_sponsor_name: string | null
  indication: string | null
  /**
   * Opt-in to revenue tracking. Most companies are pre-revenue, so the Revenue
   * tab only appears once a company is added to the roster on the Revenue page.
   * A display flag only — clearing it never deletes recorded figures.
   */
  track_revenue: boolean | null
  cap_table_as_of: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const PORTFOLIO_STATUSES = ['Active', 'Legacy', 'Exited'] as const

export interface PortfolioFundraiseRound {
  id: string
  company_id: string
  round_name: string
  amount: string | null
  date: string | null
  lead_investor: string | null
  notes: string | null
  security_type: string | null
  round_size: number | null
  pre_money: number | null
  post_money: number | null
  option_pool: number | null
  price_per_share: number | null
  status: string | null
  terms: Record<string, unknown> | null
  created_at: string
}

// Fundraising round on a PIPELINE deal — same shape as the portfolio round,
// minus Solas positions (we don't hold a pipeline company yet).
export interface DealFundraiseRound {
  id: string
  deal_id: string
  round_name: string
  security_type: string | null
  date: string | null
  lead_investor: string | null
  round_size: number | null
  pre_money: number | null
  post_money: number | null
  option_pool: number | null
  price_per_share: number | null
  status: string | null
  terms: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export interface PortfolioPosition {
  id: string
  company_id: string
  round_id: string | null
  fund: string | null
  invested_amount: number | null
  shares: number | null
  ownership_pct: number | null
  accrued_interest: number | null
  fair_value: number | null
  fair_value_date: string | null
  fair_value_source: string | null
  /**
   * Set when this row is a fund's LP interest in a sidecar we also track at
   * vehicle level (names that sidecar). Such rows stay visible on their fund but
   * are excluded from portfolio-wide totals so AUM isn't double counted.
   */
  lookthrough_of: string | null
  notes: string | null
  created_at: string
}

export const SECURITY_TYPES = ['Priced equity', 'SAFE', 'Convertible note'] as const
export type SecurityType = typeof SECURITY_TYPES[number]

export interface PortfolioValuationMark {
  id: string
  company_id: string
  as_of_date: string | null
  valuation: number | null
  basis: string | null
  notes: string | null
  created_at: string
}

export const VALUATION_BASES = ['409A', 'Secondary transaction', 'Lead investor mark', 'Internal mark', 'Public comps', 'Impairment / write-down'] as const

// ─── Cap table (share-class structure) ────────────────────────────────────────

// One row per share class per company — Common, each preferred series, the
// option pool. Structure only, no per-holder ledger. Standalone from
// portfolio_positions: ownership_pct stays hand-entered and keeps driving Fund
// Performance; the Cap Table tab flags disagreement instead of overwriting.
export const SHARE_CLASS_TYPES = ['Preferred', 'Common', 'Option pool', 'Warrants', 'Other'] as const
export type ShareClassType = typeof SHARE_CLASS_TYPES[number]

export interface PortfolioShareClass {
  id: string
  company_id: string
  name: string
  class_type: ShareClassType
  shares_outstanding: number | null
  price_per_share: number | null
  /** Liquidation preference as a multiple (1 = 1×). Null for common/pool. */
  liq_pref_multiple: number | null
  /** Preference-stack rank, 1 = most senior. Null (common, pool) sorts last. */
  seniority: number | null
  /** Participating preferred: takes its preference AND shares pro-rata. */
  participating: boolean | null
  /** Unconverted note/SAFE balance ($, incl. accrued where known) on a share-less row. */
  convertible_balance: number | null
  /** Documented conversion price; when null the waterfall derives one from its discount input. */
  conversion_price: number | null
  notes: string | null
  created_at: string
}

// One Solas vehicle's holding in a share class. The same company is held via
// several entities (funds, sidecars, H2Oey I/II) — the waterfall breaks
// proceeds out per entity, because all of them receive cash at an exit even
// where Solas earns no carry. Reference data, like the classes themselves.
export interface PortfolioClassHolding {
  id: string
  class_id: string
  entity: string
  shares: number
  created_at: string
}

// ─── Revenue (projected vs actual) ────────────────────────────────────────────

// Fiscal periods we track revenue against. Quarters and halves coexist with FY
// on purpose — companies report on whatever cadence they have, and a half-year
// update shouldn't have to be split into two invented quarters.
export const REVENUE_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'] as const
export type RevenuePeriod = typeof REVENUE_PERIODS[number]

// Last day of each period, used to derive a sortable period_end from
// period_type + fiscal_year. Mirrors periodEnd() in lib/catalysts.ts.
export const REVENUE_PERIOD_END: Record<RevenuePeriod, string> = {
  'Q1': '03-31', 'Q2': '06-30', 'Q3': '09-30', 'Q4': '12-31',
  'H1': '06-30', 'H2': '12-31', 'FY': '12-31',
}

// Where the ORIGINAL plan came from. 'Reforecast' used to live here, marking a
// row whose `projected` was a mid-year revision rather than a start-of-year
// budget — the two series sharing one column. Restatements now have their own
// field, so it was removed to stop the conflation being recreated by hand.
export const REVENUE_PROJECTED_SOURCES = ['Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate'] as const

// Where a RESTATED plan came from. A revision can be the company's own
// reforecast or the Solas team's view, and which one it is changes how much
// weight the number carries — so it's recorded rather than inferred.
export const REVENUE_REVISED_SOURCES = ['Company reforecast', 'Board deck', 'Management update', 'Investor update', 'Solas team estimate'] as const

export const REVENUE_ACTUAL_SOURCES = ['Audited', 'Management reported', 'Board deck', 'Investor update', 'Public filing', 'Unaudited estimate'] as const

export interface PortfolioRevenue {
  id: string
  company_id: string
  period_type: string
  fiscal_year: number
  /** Derived from period_type + fiscal_year on save; stored so the DB can sort. */
  period_end: string | null
  /** The ORIGINAL plan for the period. Never overwritten by a later restatement. */
  projected: number | null
  /**
   * Restated plan — a company reforecast or the Solas team's own revision. Null
   * means the original still stands. Kept beside `projected` rather than
   * replacing it so both the target that was set and the target now expected
   * remain readable; /analytics measures reliability against the former.
   */
  revised_projected: number | null
  actual: number | null
  projected_source: string | null
  /** When the projection was made — a forecast has a vintage, not just a target. */
  projected_as_of: string | null
  revised_source: string | null
  /** When the revision was made. A reforecast has a vintage too. */
  revised_as_of: string | null
  actual_source: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Runway / cash ────────────────────────────────────────────────────────────

// What a burn figure actually measures. Recorded per observation because decks
// are inconsistent about it, and net burn against gross opex burn is not a
// comparison — it's two different numbers. 'Net' is the one runway means.
export const BURN_BASES = [
  'Net burn',
  'Gross opex',
  'Net burn — 3-mo average',
  'Net burn — single month',
  'Operating cash outflow',
  // The only FORWARD-LOOKING basis. Every other value above is something that
  // already happened; this one is the company's own budgeted run rate, for the
  // case where a flat actual badly misstates the runway because spend is planned
  // to ramp. Aurenar is why it exists — see isPlannedBurn() in lib/runway.ts,
  // which keeps it out of the comparisons that only make sense between actuals.
  'Planned average — budget',
] as const

export const CASH_SOURCES = [
  'Board deck',
  'Management reported',
  'Investor update',
  'Audited',
  'Public filing',
  'Solas estimate',
] as const

export interface PortfolioCash {
  id: string
  company_id: string
  /** Date the balance was MEASURED — not when the deck was sent or found. */
  as_of: string
  cash_on_hand: number | null
  /** Dollars per month, positive when spending. Zero or below = not burning. */
  monthly_burn: number | null
  burn_basis: string | null
  /** The company's own runway claim, kept separate from cash ÷ burn. */
  runway_months: number | null
  out_of_cash_date: string | null
  /** Committed but not yet in the bank — drives a pro-forma runway only. */
  committed_funding: number | null
  /**
   * The stated-vs-derived runway gap (%) reviewed and accepted, clearing the
   * "check" flag. A percentage rather than a boolean so the flag returns if the
   * gap later moves materially — a boolean would stay stuck once set.
   */
  mismatch_ack_pct: number | null
  /** Why the gap is expected. The reasoning is the point of clearing it. */
  mismatch_ack_note: string | null
  mismatch_acked_at: string | null
  mismatch_acked_by: string | null
  source: string | null
  /** Which deck, which slide — so a figure stays traceable. */
  source_detail: string | null
  notes: string | null
  /** Who first entered the row. NULL for rows bulk-loaded over the REST API. */
  created_by: string | null
  /** Who last edited it through the app. NULL means never edited since creation. */
  updated_by: string | null
  created_at: string
  updated_at: string
}

/**
 * A projected cash/burn point from a company deck.
 *
 * Deliberately a separate table from PortfolioCash — see
 * supabase/migration_cash_forecast.sql for why a `kind` column was rejected.
 * The short version: a forecast has a VINTAGE, it has to be able to coexist
 * with the actual for the same period so the two can be compared, and it must
 * never be picked up by the runway helpers.
 */
export interface PortfolioCashForecast {
  id: string
  company_id: string
  /** When the projection was MADE. Two vintages of one period are both kept. */
  forecast_as_of: string
  /** The period being projected, end-dated to line up with balance dates. */
  period_end: string
  /** Projected end-of-period cash. NEGATIVE on purpose — that's the funding gap. */
  cash_on_hand: number | null
  /** Projected burn per MONTH, positive when spending. Same units as PortfolioCash. */
  monthly_burn: number | null
  burn_basis: string | null
  /** NULL = the company's base case. Otherwise names the path, e.g. "Unfunded". */
  scenario: string | null
  source: string | null
  source_detail: string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const INTRO_STATUSES = ['Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested'] as const
export type IntroStatus = typeof INTRO_STATUSES[number]

export interface PortfolioInvestorIntro {
  id: string
  company_id: string
  investor_name: string
  investor_firm: string | null
  contact_email: string | null
  intro_date: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

// Shape shared by portfolio_investor_intros and deal_investor_intros (FK column omitted — not needed in the UI)
export interface InvestorIntro {
  id: string
  investor_name: string
  investor_firm: string | null
  contact_email: string | null
  intro_date: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

// Ever-growing directory of investors we've introduced companies to (autocomplete source)
export interface InvestorContact {
  id: string
  name: string
  firm: string | null
  contact_email: string | null
  created_at: string
  updated_at: string
}

// A manually-added known competitor for a deal or portfolio company
export interface CompanyCompetitor {
  id: string
  entity_type: 'deal' | 'portfolio'
  entity_id: string
  name: string
  note: string | null
  url: string | null
  created_by: string | null
  created_at: string
}

// One non-confidential deck (per raise) attached to a deal or portfolio company
export interface CompanyDeck {
  id: string
  entity_type: string
  entity_id: string
  company_name: string | null
  /** Snapshot / fallback label. When round_id is set the round's name wins. */
  label: string
  /** Optional link to a fundraising round (portfolio or deal, per entity_type). */
  round_id: string | null
  storage_path: string
  file_name: string
  token: string | null
  shared_at: string | null
  sort_order: number
  created_at: string
}

// A logged open of a shared non-confidential deck link
export interface DeckView {
  id: string
  token: string
  entity_type: string
  entity_id: string | null
  company_name: string | null
  viewer_name: string | null
  viewer_email: string | null
  viewed_at: string
}

export interface Catalyst {
  id: string
  company_name: string
  /**
   * Structural link to the portfolio company. Nullable: catalysts on pipeline
   * deals (and legacy names) key on company_name alone. When set, it survives
   * a company rename even if the name-sync ever fails.
   */
  company_id: string | null
  title: string
  catalyst_date: string
  period: string | null
  original_date: string | null
  original_period: string | null
  status: string | null
  resolved_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CatalystActivity {
  id: string
  company_name: string
  catalyst_title: string
  action: string
  details: string | null
  actor_name: string | null
  created_at: string
}

// ─── Durable error log ────────────────────────────────────────────────────────

/** A failure that would otherwise only reach an ephemeral console. See lib/log.ts. */
export interface LogEvent {
  id: string
  level: 'error' | 'warn' | 'info'
  source: string
  message: string
  created_at: string
}

/**
 * One month of inbound pitch volume from the email audit — distinct companies,
 * not raw messages. The top of the dealflow funnel on Analytics.
 */
export interface MonthlyPitchCount {
  id: string
  /** First of the month, yyyy-mm-01. One row per month. */
  month: string
  pitches: number
  created_at: string
  updated_at: string
}
