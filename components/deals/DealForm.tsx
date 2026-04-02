'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Deal, DealStage, DEAL_STAGES, CustomFieldDefinition } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  deal?: Deal
  onClose: () => void
  onSaved: (deal: Deal) => void
}

const CORE_FIELDS = [
  { name: 'name', label: 'Company Name', type: 'text', required: true },
  { name: 'website', label: 'Website', type: 'url' },
  { name: 'sector', label: 'Sector', type: 'text' },
  { name: 'check_size', label: 'Check Size', type: 'text' },
  { name: 'lead_partner', label: 'Lead Partner', type: 'text' },
  { name: 'founders', label: 'Founder(s)', type: 'text' },
  { name: 'source', label: 'Source', type: 'text' },
  { name: 'series', label: 'Series', type: 'text' },
  { name: 'current_fundraise', label: 'Current Fundraise', type: 'text' },
  { name: 'fundraising_to_date', label: 'Fundraising to Date', type: 'text' },
]

export default function DealForm({ deal, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])

  const [form, setForm] = useState({
    name: deal?.name ?? '',
    website: deal?.website ?? '',
    sector: deal?.sector ?? '',
    check_size: deal?.check_size ?? '',
    lead_partner: deal?.lead_partner ?? '',
    founders: deal?.founders ?? '',
    source: deal?.source ?? '',
    stage: (deal?.stage ?? 'Sourced') as DealStage,
    category: deal?.category ?? '' as string,
    series: deal?.series ?? '',
    current_fundraise: deal?.current_fundraise ?? '',
    fundraising_to_date: deal?.fundraising_to_date ?? '',
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

  function setField(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCustomField(key: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      custom_fields: { ...prev.custom_fields, [key]: value },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      website: form.website || null,
      sector: form.sector || null,
      check_size: form.check_size || null,
      lead_partner: form.lead_partner || null,
      founders: form.founders || null,
      source: form.source || null,
      stage: form.stage,
      category: form.category || null,
      series: (form as Record<string, unknown>)['series'] as string || null,
      current_fundraise: (form as Record<string, unknown>)['current_fundraise'] as string || null,
      fundraising_to_date: (form as Record<string, unknown>)['fundraising_to_date'] as string || null,
      description: form.description || null,
      custom_fields: form.custom_fields,
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

    onSaved(result.data as Deal)
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
          {CORE_FIELDS.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type={field.type}
                required={field.required}
                value={(form as Record<string, unknown>)[field.name] as string}
                onChange={(e) => setField(field.name, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          ))}

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
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {loading ? 'Saving…' : deal ? 'Save Changes' : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
