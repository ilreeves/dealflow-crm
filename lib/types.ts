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
  non_con_deck_path: string | null
  non_con_deck_name: string | null
  non_con_deck_token: string | null
  non_con_deck_shared_at: string | null
  custom_fields: Record<string, unknown>
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
  non_con_deck_path: string | null
  non_con_deck_name: string | null
  non_con_deck_token: string | null
  non_con_deck_shared_at: string | null
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

// ─── Revenue (projected vs actual) ────────────────────────────────────────────

// Fiscal periods we track revenue against. Quarters and halves coexist with FY
// on purpose — companies report on whatever cadence they have, and a half-year
// update shouldn't have to be split into two invented quarters.
export const REVENUE_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'] as const
export type RevenuePeriod = typeof REVENUE_PERIODS[number]

// Last day of each period, used to derive a sortable period_end from
// period_type + fiscal_year. Mirrors CATALYST_PERIOD_END.
export const REVENUE_PERIOD_END: Record<RevenuePeriod, string> = {
  'Q1': '03-31', 'Q2': '06-30', 'Q3': '09-30', 'Q4': '12-31',
  'H1': '06-30', 'H2': '12-31', 'FY': '12-31',
}

export const REVENUE_PROJECTED_SOURCES = ['Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate'] as const
export const REVENUE_ACTUAL_SOURCES = ['Audited', 'Management reported', 'Board deck', 'Investor update', 'Public filing', 'Unaudited estimate'] as const

export interface PortfolioRevenue {
  id: string
  company_id: string
  period_type: string
  fiscal_year: number
  /** Derived from period_type + fiscal_year on save; stored so the DB can sort. */
  period_end: string | null
  projected: number | null
  actual: number | null
  projected_source: string | null
  /** When the projection was made — a forecast has a vintage, not just a target. */
  projected_as_of: string | null
  actual_source: string | null
  notes: string | null
  created_by: string | null
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

// One non-confidential deck (per raise) attached to a deal or portfolio company
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
