'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Deal, DealStage, DEAL_STAGES, CustomFieldDefinition } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/activity'
import { fetchListOptions, ListKey } from '@/lib/listOptions'
import { addDealToPortfolio } from '@/lib/portfolio'

interface Props {
  deal?: Deal
  onClose: () => void
  onSaved: (deal: Deal) => void
}

const ABMS_SPECIALTIES = [
  'Allergy & Immunology',
  'Anesthesiology',
  'Colon & Rectal Surgery',
  'Dermatology',
  'Emergency Medicine',
  'Family Medicine',
  'Internal Medicine (General)',
  // ABIM subspecialties
  'IM - Advanced Heart Failure & Transplant Cardiology',
  'IM - Cardiovascular Disease',
  'IM - Clinical Cardiac Electrophysiology',
  'IM - Critical Care Medicine',
  'IM - Endocrinology, Diabetes & Metabolism',
  'IM - Gastroenterology',
  'IM - Geriatric Medicine',
  'IM - Hematology',
  'IM - Infectious Disease',
  'IM - Interventional Cardiology',
  'IM - Medical Oncology',
  'IM - Nephrology',
  'IM - Pulmonary Disease',
  'IM - Rheumatology',
  'IM - Sleep Medicine',
  'Medical Genetics and Genomics',
  'Neurological Surgery',
  'Nuclear Medicine',
  'Obstetrics & Gynecology',
  'Ophthalmology',
  'Orthopaedic Surgery',
  'Otolaryngology - Head and Neck Surgery',
  'Pathology',
  'Pediatrics',
  'Physical Medicine & Rehabilitation',
  'Plastic Surgery',
  'Preventive Medicine',
  'Psychiatry & Neurology',
  'Radiology',
  'Surgery',
  'Thoracic Surgery',
  'Urology',
]

const SERIES_OPTIONS = ['Pre-Seed', 'Seed', 'Convertible Note/SAFE', 'A', 'B', 'C', 'D+', 'Crossover', 'Public']
const CLINICAL_STAGE_OPTIONS = [
  'Preclinical',
  'Pre-IND',
  'Phase I',
  'Phase II',
  'Phase III',
  'Pre-IDE',
  'FIH',
  'Pivotal',
  '510(k)',
  'PMA',
  'Approved / Marketed',
]

const CORE_FIELDS = [
  { name: 'name', label: 'Company Name', type: 'text', required: true },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'sharepoint_link', label: 'SharePoint Link', type: 'url' },
  { name: 'contact_email', label: 'Contact Email', type: 'email' },
  { name: 'sector', label: 'Sector', type: 'select', options: ABMS_SPECIALTIES },
  { name: 'city', label: 'City', type: 'text' },
  { name: 'state', label: 'State / Region', type: 'text' },
  { name: 'country', label: 'Country', type: 'text' },
  { name: 'clinical_stage', label: 'Clinical Stage', type: 'select', options: CLINICAL_STAGE_OPTIONS },
  { name: 'lead_partner', label: 'Lead Partner', type: 'text' },
  { name: 'founders', label: 'CEO', type: 'text' },
  { name: 'source', label: 'Source', type: 'text' },
  { name: 'series', label: 'Series', type: 'select', options: SERIES_OPTIONS },
  { name: 'current_fundraise', label: 'Current Fundraise', type: 'text' },
  { name: 'current_valuation', label: 'Current Valuation', type: 'text' },
  { name: 'fundraising_to_date', label: 'Fundraising to Date', type: 'text' },
]

export default function DealForm({ deal, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
  const [passReason, setPassReason] = useState('')
  const [lists, setLists] = useState<Record<ListKey, string[]> | null>(null)

  const [form, setForm] = useState({
    name: deal?.name ?? '',
    website: deal?.website ?? '',
    sharepoint_link: deal?.sharepoint_link ?? '',
    contact_email: deal?.contact_email ?? '',
    sector: deal?.sector ?? '',
    city: deal?.city ?? '',
    state: deal?.state ?? '',
    country: deal?.country ?? '',
    clinical_stage: deal?.clinical_stage ?? '',
    lead_partner: deal?.lead_partner ?? '',
    founders: deal?.founders ?? '',
    source: deal?.source ?? '',
    stage: (deal?.stage ?? 'Sourced') as DealStage,
    category: deal?.category ?? '' as string,
    series: deal?.series ?? '',
    current_fundraise: deal?.current_fundraise ?? '',
    fundraising_to_date: deal?.fundraising_to_date ?? '',
    current_valuation: deal?.current_valuation ?? '',
    description: deal?.description ?? '',
    custom_fields: deal?.custom_fields ?? {} as Record<string, unknown>,
  })

  useEffect(() => {
    supabase
      .from('custom_field_definitions')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCustomFieldDefs((data as CustomFieldDefinition[]) ?? []))
  }, [])

  useEffect(() => {
    fetchListOptions().then(setLists)
  }, [])

  function setField(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCustomField(key: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      custom_fields: { ...prev.custom_fields, [key]: value },
    }))
  }

  const passReasonRequired = form.stage === 'Passed' && (!deal || deal.stage !== 'Passed')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    if (passReasonRequired && !passReason.trim()) {
      setError('Please add a note on why we passed before saving.')
      return
    }
    setLoading(true)
    setError('')

    const stageChanged = !deal || form.stage !== deal.stage
    const payload = {
      name: form.name.trim(),
      website: form.website || null,
      sharepoint_link: form.sharepoint_link || null,
      contact_email: form.contact_email || null,
      sector: form.sector || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      clinical_stage: (form as Record<string, unknown>)['clinical_stage'] as string || null,
      lead_partner: form.lead_partner || null,
      founders: form.founders || null,
      source: form.source || null,
      stage: form.stage,
      category: form.category || null,
      series: (form as Record<string, unknown>)['series'] as string || null,
      current_fundraise: (form as Record<string, unknown>)['current_fundraise'] as string || null,
      fundraising_to_date: (form as Record<string, unknown>)['fundraising_to_date'] as string || null,
      current_valuation: (form as Record<string, unknown>)['current_valuation'] as string || null,
      description: form.description || null,
      custom_fields: form.custom_fields,
      ...(stageChanged ? { stage_entered_at: new Date().toISOString() } : {}),
    }

    let result
    if (deal) {
      result = await supabase.from('deals').update(payload).eq('id', deal.id).select().single()
    } else {
      result = await supabase.from('deals').insert(payload).select().single()
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const saved = result.data as Deal
    if (!deal) {
      await logActivity(saved.id, saved.name, 'Deal added', `Stage: ${saved.stage}`)
    } else if (stageChanged) {
      const details = passReason.trim() ? `${deal.stage} \u2192 ${form.stage}: ${passReason.trim()}` : `${deal.stage} \u2192 ${form.stage}`
      await logActivity(saved.id, saved.name, 'Stage changed', details)
    }
    if (saved.stage === 'Invested' && (!deal || deal.stage !== 'Invested')) {
      await addDealToPortfolio(supabase, saved)
      await logActivity(saved.id, saved.name, 'Added to portfolio', 'Auto-added on move to Invested')
    }
    if (passReasonRequired && passReason.trim()) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('deal_notes').insert({
        deal_id: saved.id,
        content: `Passed: ${passReason.trim()}`,
        author_id: user?.id ?? null,
        author_name: null,
      })
    }
    onSaved(saved)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {deal ? 'Edit Deal' : 'New Deal'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Stage */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Stage</label>
            <select
              value={form.stage}
              onChange={(e) => setField('stage', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {DEAL_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {passReasonRequired && (
              <div className="mt-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Why are we passing?<span className="text-red-500 ml-0.5">*</span>
                </label>
                <textarea
                  rows={2}
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                  placeholder="e.g. Too early, valuation too high, outside our thesis…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                />
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
            <div className="flex gap-2">
              {['Devices', 'Drugs'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setField('category', form.category === cat ? '' : cat)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    form.category === cat
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Core fields */}
          {CORE_FIELDS.map((field) => {
            const value = (form as Record<string, unknown>)[field.name] as string
            const fieldOptions = (lists && (field.name in lists) ? lists[field.name as ListKey] : field.options) ?? []
            return (
              <div key={field.name}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={value}
                    onChange={(e) => setField(field.name, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="">Select…</option>
                    {value && !fieldOptions.includes(value) && (
                      <option value={value}>{value}</option>
                    )}
                    {fieldOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    value={value}
                    onChange={(e) => setField(field.name, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                )}
              </div>
            )
          })}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {/* Custom fields */}
          {customFieldDefs.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Custom Fields</p>
              <div className="space-y-4">
                {customFieldDefs.map((def) => (
                  <div key={def.id}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {def.label}
                      {def.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {def.field_type === 'select' ? (
                      <select
                        value={(form.custom_fields[def.name] as string) ?? ''}
                        onChange={(e) => setCustomField(def.name, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="">Select…</option>
                        {(def.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : def.field_type === 'boolean' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(form.custom_fields[def.name])}
                          onChange={(e) => setCustomField(def.name, e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-600">Yes</span>
                      </label>
                    ) : (
                      <input
                        type={def.field_type === 'number' ? 'number' : def.field_type === 'date' ? 'date' : 'text'}
                        value={(form.custom_fields[def.name] as string) ?? ''}
                        onChange={(e) => setCustomField(def.name, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition" style={{backgroundColor: "#023a51"}}
          >
            {loading ? 'Saving…' : deal ? 'Save Changes' : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
