'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { PortfolioCompany } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { fetchListOptions, ABMS_SPECIALTIES, FALLBACK_LISTS, ListKey } from '@/lib/listOptions'

interface Props {
  company?: PortfolioCompany
  onClose: () => void
  onSaved: (company: PortfolioCompany) => void
}

export default function PortfolioCompanyForm({ company, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lists, setLists] = useState<Record<ListKey, string[]>>(FALLBACK_LISTS)
  const [deckFile, setDeckFile] = useState<File | null>(null)
  const [deckLabel, setDeckLabel] = useState('')
  // Set once the INSERT succeeds. If a later step (rename relink, deck upload)
  // fails and the user hits Save again, the retry must take the UPDATE path —
  // otherwise it inserts the company a second time.
  const createdRef = useRef<PortfolioCompany | null>(null)

  useEffect(() => { fetchListOptions().then(setLists) }, [])

  const fieldOpts = (field: { name: string; options?: string[] }) =>
    field.name === 'series' ? lists.series : field.name === 'clinical_stage' ? lists.clinical_stage : (field.options ?? [])

  const [form, setForm] = useState({
    name: company?.name ?? '',
    sector: company?.sector ?? '',
    category: company?.category ?? '',
    status: company?.status ?? 'Active',
    funds: company?.funds ?? [] as string[],
    series: company?.series ?? '',
    clinical_stage: company?.clinical_stage ?? '',
    drug_names: company?.drug_names ?? '',
    indication: company?.indication ?? '',
    ct_sponsor_name: company?.ct_sponsor_name ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    country: company?.country ?? '',
    website: company?.website ?? '',
    contact_email: company?.contact_email ?? '',
    description: company?.description ?? '',
    current_valuation: company?.current_valuation ?? '',
    current_fundraise: company?.current_fundraise ?? '',
    sharepoint_link: company?.sharepoint_link ?? '',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleFund(fund: string) {
    setForm((prev) => ({
      ...prev,
      funds: prev.funds.includes(fund) ? prev.funds.filter((f: string) => f !== fund) : [...prev.funds, fund],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      sector: form.sector || null,
      category: form.category || null,
      status: form.status || 'Active',
      funds: form.funds.length ? form.funds : null,
      series: form.series || null,
      clinical_stage: form.clinical_stage || null,
      drug_names: form.drug_names || null,
      indication: form.indication || null,
      ct_sponsor_name: form.ct_sponsor_name || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      website: form.website || null,
      contact_email: form.contact_email || null,
      description: form.description || null,
      current_valuation: form.current_valuation || null,
      current_fundraise: form.current_fundraise || null,
      sharepoint_link: form.sharepoint_link || null,
    }

    const existing = company ?? createdRef.current
    let result
    if (existing) {
      result = await supabase.from('portfolio_companies').update(payload).eq('id', existing.id).select().single()
    } else {
      result = await supabase.from('portfolio_companies').insert(payload).select().single()
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const saved = result.data as PortfolioCompany
    if (!existing) createdRef.current = saved

    // Catalysts (and their activity log, the legacy roster, and deck labels)
    // join to this company BY NAME — a rename without these updates silently
    // detaches every catalyst from the company's tab.
    if (company && company.name !== saved.name) {
      const renames = await Promise.all([
        supabase.from('catalysts').update({ company_name: saved.name }).eq('company_name', company.name),
        supabase.from('catalyst_activity').update({ company_name: saved.name }).eq('company_name', company.name),
        supabase.from('legacy_companies').update({ company_name: saved.name }).eq('company_name', company.name),
        supabase.from('company_decks').update({ company_name: saved.name })
          .eq('entity_type', 'portfolio').eq('entity_id', saved.id),
      ])
      const renameErr = renames.map((r) => r.error).find(Boolean)
      if (renameErr) {
        setError(`Renamed, but couldn't relink its catalysts — old rows may still say "${company.name}": ${renameErr.message}`)
        setLoading(false)
        return
      }
    }

    // Attach the optional non-con deck now that the company (and its id) exists
    if (!company && deckFile) {
      const storagePath = `portfolio/${saved.id}/noncon-deck/${Date.now()}-${deckFile.name}`
      const { error: upErr } = await supabase.storage.from('deal-files').upload(storagePath, deckFile)
      if (upErr) {
        // The company itself saved — don't block on the deck, but don't let the
        // failure vanish either. It can be re-attached from the Decks section.
        setError(`${saved.name} was saved, but the deck failed to upload: ${upErr.message}. Add it again from the Decks section.`)
        setLoading(false)
        return
      }
      const { error: deckErr } = await supabase.from('company_decks').insert({
        entity_type: 'portfolio',
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
    }

    onSaved(saved)
  }

  const fields = [
    { name: 'name', label: 'Company Name', type: 'text', required: true },
    { name: 'sector', label: 'Sector / Therapeutic Area', type: 'select', options: ABMS_SPECIALTIES },
    // fieldOpts routes these two to `lists` (seeded from FALLBACK_LISTS), so
    // the options here never actually render — kept pointing at the same
    // constants so they can't drift if that ever changes.
    { name: 'series', label: 'Series', type: 'select', options: FALLBACK_LISTS.series },
    { name: 'clinical_stage', label: 'Clinical Stage', type: 'select', options: FALLBACK_LISTS.clinical_stage },
    { name: 'drug_names', label: 'Drug / Asset Name(s)', type: 'text' },
    { name: 'indication', label: 'Indication', type: 'text' },
    { name: 'ct_sponsor_name', label: 'ClinicalTrials.gov Sponsor', type: 'text' },
    { name: 'city', label: 'City', type: 'text' },
    { name: 'state', label: 'State / Region', type: 'text' },
    { name: 'country', label: 'Country', type: 'text' },
    { name: 'website', label: 'Website', type: 'url' },
    { name: 'contact_email', label: 'Contact Email', type: 'email' },
    { name: 'current_valuation', label: 'Current Valuation', type: 'text' },
    { name: 'current_fundraise', label: 'Current Fundraising Need', type: 'text' },
    { name: 'sharepoint_link', label: 'SharePoint Link', type: 'url' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {company ? 'Edit Company' : 'Add Portfolio Company'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="portfolio-company-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.type === 'select' ? (
                <select
                  value={(form as unknown as Record<string, string>)[field.name]}
                  onChange={(e) => set(field.name, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="">Select…</option>
                  {(form as unknown as Record<string, string>)[field.name] && !fieldOpts(field).includes((form as unknown as Record<string, string>)[field.name]) && (
                    <option value={(form as unknown as Record<string, string>)[field.name]}>{(form as unknown as Record<string, string>)[field.name]}</option>
                  )}
                  {fieldOpts(field).map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  required={field.required}
                  value={(form as unknown as Record<string, string>)[field.name]}
                  onChange={(e) => set(field.name, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
            <div className="flex items-center gap-2">
              {['Drugs', 'Devices'].map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => set('category', form.category === cat ? '' : cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.category === cat
                      ? cat === 'Drugs' ? 'border-transparent bg-purple-100 text-purple-700' : 'border-transparent bg-blue-100 text-blue-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <div className="flex items-center gap-2">
              {['Active', 'Legacy', 'Exited'].map((st) => (
                <button
                  type="button"
                  key={st}
                  onClick={() => set('status', st)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.status === st
                      ? 'border-transparent bg-slate-800 text-white'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fund / Vehicle</label>
            <div className="flex items-center gap-2 flex-wrap">
              {lists.fund.map((fund) => (
                <button
                  type="button"
                  key={fund}
                  onClick={() => toggleFund(fund)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.funds.includes(fund)
                      ? 'border-transparent text-white'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                  style={form.funds.includes(fund) ? { backgroundColor: '#023a51' } : {}}
                >
                  {fund}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {/* Non-confidential deck (new companies only — edits use the Decks section on the detail view) */}
          {!company && (
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

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition">
            Cancel
          </button>
          <button
            type="submit"
            form="portfolio-company-form"
            disabled={loading}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition"
            style={{backgroundColor: '#023a51'}}
          >
            {loading ? 'Saving…' : company ? 'Save Changes' : 'Add Company'}
          </button>
        </div>
      </div>
    </div>
  )
}
