export type DealStage =
  | 'Sourced'
  | 'First Meeting'
  | 'Science Committee'
  | 'Finance Committee'
  | 'Investment Committee'
  | 'Term Sheet'
  | 'Invested'
  | 'Passed'

export const DEAL_STAGES: DealStage[] = [
  'Passed',
  'Sourced',
  'First Meeting',
  'Science Committee',
  'Finance Committee',
  'Investment Committee',
  'Term Sheet',
  'Invested',
]

export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; border: string }> = {
  'Sourced':               { bg: 'bg-slate-100',   text: 'text-slate-700',  border: 'border-slate-300' },
  'First Meeting':         { bg: 'bg-indigo-100',  text: 'text-indigo-700', border: 'border-indigo-300' },
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
  current_fundraise: string | null
  fundraising_to_date: string | null
  series: string | null
  current_valuation: string | null
  custom_fields: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
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
  website: string | null
  contact_email: string | null
  description: string | null
  current_valuation: string | null
  current_fundraise: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PortfolioFundraiseRound {
  id: string
  company_id: string
  round_name: string
  amount: string | null
  date: string | null
  lead_investor: string | null
  notes: string | null
  created_at: string
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
