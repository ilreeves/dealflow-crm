'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { Deal, DealStage, DEAL_STAGES, CustomFieldDefinition } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/activity'
import { fetchListOptions, ABMS_SPECIALTIES, FALLBACK_LISTS, ListKey } from '@/lib/listOptions'
import { addDealToPortfolio } from '@/lib/portfolio'

interface Props {
  deal?: Deal
  onClose: () => void
  onSaved: (deal: Deal) => void
}

// Series and clinical-stage options only cover the moment before list_options
// has loaded — once it has, the select reads from `lists` instead.
const CORE_FIELDS = [
  { name: 'name', label: 'Company Name', type: 'text', required: true },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'sharepoint_link', label: 'SharePoint Link', type: 'url' },
  { name: 'contact_email', label: 'Contact Email', type: 'email' },
  { name: 'sector', label: 'Sector', type: 'select', options: ABMS_SPECIALTIES },
  { name: 'city', label: 'City', type: 'text' },
  { name: 'state', label: 'State / Region', type: 'text' },
  { name: 'country', label: 'Country', type: 'text' },
  { name: 'clinical_stage', label: 'Clinical Stage', type: 'select', options: FALLBACK_LISTS.clinical_stage },
  { name: 'drug_names', label: 'Drug / Asset Name(s)', type: 'text' },
  { name: 'indication', label: 'Indication', type: 'text' },
  { name: 'ct_sponsor_name', label: 'ClinicalTrials.gov Sponsor', type: 'text' },
  { name: 'lead_partner', label: 'Lead Partner', type: 'text' },
  { name: 'founders', label: 'CEO', type: 'text' },
  { name: 'source', label: 'Source', type: 'combo' },
  { name: 'series', label: 'Series', type: 'select', options: FALLBACK_LISTS.series },
  { name: 'current_fundraise', label: 'Current Fundraise', type: 'text' },
  { name: 'current_valuation', label: 'Current Valuation', type: 'text' },
  { name: 'fundraising_to_date', label: 'Fundraising to Date', type: 'text' },
  // The deals table has always had this column and the list view has always
  // shown it — but until now no form wrote it, so it rendered "—" forever.
  { name: 'check_size', label: 'Check Size', type: 'text' },
]

export default function DealForm({ deal, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
  const [passReason, setPassReason] = useState('')
  const [lists, setLists] = useState<Record<ListKey, string[]> | null>(null)
  const [deckFile, setDeckFile] = useState<File | null>(null)
  const [deckLabel, setDeckLabel] = useState('')
  const [dateAdded, setDateAdded] = useState(new Date().toISOString().slice(0, 10))
  const [sourceOptions, setSourceOptions] = useState<string[]>([])
  // Set once the INSERT succeeds. If a later step (deck upload, portfolio
  // mirror) fails and the user hits Save again, the retry must take the
  // UPDATE path — otherwise it inserts the deal a second time.
  const createdRef = useRef<Deal | null>(null)

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
    drug_names: deal?.drug_names ?? '',
    indication: deal?.indication ?? '',
    ct_sponsor_name: deal?.ct_sponsor_name ?? '',
    lead_partner: deal?.lead_partner ?? '',
    founders: deal?.founders ?? '',
    source: deal?.source ?? '',
    stage: (deal?.stage ?? 'Sourced') as DealStage,
    category: deal?.category ?? '' as string,
    series: deal?.series ?? '',
    current_fundraise: deal?.current_fundraise ?? '',
    fundraising_to_date: deal?.fundraising_to_date ?? '',
    current_valuation: deal?.current_valuation ?? '',
    check_size: deal?.check_size ?? '',
    description: deal?.description ?? '',
    custom_fields: deal?.custom_fields ?? {} as Record<string, unknown>,
  })

  useEffect(() => {
    supabase
      .from('custom_field_definitions')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCustomFieldDefs((data as CustomFieldDefinition[]) ?? []))
  }, [supabase])

  useEffect(() => {
    fetchListOptions().then(setLists)
  }, [])

  // Existing source values power the Source combo box's dropdown (free text + suggestions).
  useEffect(() => {
    supabase.from('deals').select('source').not('source', 'is', null).then(({ data }) => {
      const vals = Array.from(new Set(((data as { source: string | null }[]) ?? [])
        .map((d) => d.source).filter((s): s is string => !!s && s.trim() !== '')))
        .sort((a, b) => a.localeCompare(b))
      setSourceOptions(vals)
    })
  }, [supabase])

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

    const existing = deal ?? createdRef.current
    const stageChanged = !existing || form.stage !== existing.stage
    // New deals can be backdated to the actual contact date; edits keep their original created_at
    const effectiveDate = existing ? new Date().toISOString() : new Date(dateAdded + 'T12:00:00').toISOString()
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
      drug_names: form.drug_names || null,
      indication: form.indication || null,
      ct_sponsor_name: form.ct_sponsor_name || null,
      lead_partner: form.lead_partner || null,
      founders: form.founders || null,
      source: form.source || null,
      stage: form.stage,
      category: form.category || null,
      series: (form as Record<string, unknown>)['series'] as string || null,
      current_fundraise: (form as Record<string, unknown>)['current_fundraise'] as string || null,
      fundraising_to_date: (form as Record<string, unknown>)['fundraising_to_date'] as string || null,
      current_valuation: (form as Record<string, unknown>)['current_valuation'] as string || null,
      check_size: form.check_size || null,
      description: form.description || null,
      custom_fields: form.custom_fields,
      ...(stageChanged ? { stage_entered_at: effectiveDate } : {}),
      ...(!existing ? { created_at: effectiveDate } : {}),
    }

    let result
    if (existing) {
      result = await supabase.from('deals').update(payload).eq('id', existing.id).select().single()
    } else {
      result = await supabase.from('deals').insert(payload).select().single()
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const saved = result.data as Deal
    if (!existing) {
      createdRef.current = saved
      await logActivity(saved.id, saved.name, 'Deal added', `Stage: ${saved.stage}`)
    } else if (stageChanged) {
      const details = passReason.trim() ? `${existing.stage} \u2192 ${form.stage}: ${passReason.trim()}` : `${existing.stage} \u2192 ${form.stage}`
      await logActivity(saved.id, saved.name, 'Stage changed', details)
    }
    // Attach the optional non-con deck now that the deal (and its id) exists.
    // Keyed on `deal` (not `existing`) so a retry after a later failure still
    // attaches it; cleared on success so the retry can't attach it twice.
    if (!deal && deckFile) {
      const storagePath = `${saved.id}/noncon-deck/${Date.now()}-${deckFile.name}`
      const { error: upErr } = await supabase.storage.from('deal-files').upload(storagePath, deckFile)
      if (upErr) {
        setError(`${saved.name} was saved, but the deck failed to upload: ${upErr.message}. Add it again from the Decks section.`)
        setLoading(false)
        return
      }
      const { error: deckErr } = await supabase.from('company_decks').insert({
        entity_type: 'deal',
        entity_id: saved.id,
        company_name: saved.name,
        label: deckLabel.trim() || 'Deck',
        storage_path: storagePath,
        file_name: deckFile.name,
        sort_order: 0,
      })
      if (deckErr) {
        // Roll the orphaned object back so a retry doesn't stack copies.
        await supabase.storage.from('deal-files').remove([storagePath])
        setError(`${saved.name} was saved, but the deck couldn't be recorded: ${deckErr.message}. Add it again from the Decks section.`)
        setLoading(false)
        return
      }
      setDeckFile(null)
    }
    if (saved.stage === 'Invested' && (!deal || deal.stage !== 'Invested')) {
      const { error: mirrorErr } = await addDealToPortfolio(supabase, saved)
      if (mirrorErr) {
        setError(`Saved, but couldn't add ${saved.name} to the portfolio: ${mirrorErr.message}`)
        setLoading(false)
        return
      }
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
        <form id="deal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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

          {/* Date added (new deals only — can be backdated to the actual contact date) */}
          {!deal && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date Added</label>
              <input
                type="date"
                value={dateAdded}
                onChange={(e) => setDateAdded(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <p className="text-xs text-slate-400 mt-1">Defaults to today — set an earlier date if you made contact before adding it here.</p>
            </div>
          )}

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
                ) : field.type === 'combo' ? (
                  <>
                    <input
                      list={`${field.name}-options`}
                      value={value}
                      onChange={(e) => setField(field.name, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <datalist id={`${field.name}-options`}>
                      {(field.name === 'source' ? sourceOptions : fieldOptions).map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  </>
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

          {/* Non-confidential deck (new deals only — edits use the Decks section on the detail view) */}
          {!deal && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Non-Confidential Deck <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                placeholder="Label (e.g. Series B)"
                value={deckLabel}
                onChange={(e) => setDeckLabel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 mb-2"
              />
              <label className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition text-slate-500">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="truncate">{deckFile ? deckFile.name : 'Choose a file to upload'}</span>
                <input type="file" className="hidden" onChange={(e) => setDeckFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}

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
            type="submit"
            form="deal-form"
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
