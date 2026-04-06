'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { PortfolioCompany } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  company?: PortfolioCompany
  onClose: () => void
  onSaved: (company: PortfolioCompany) => void
}

export default function PortfolioCompanyForm({ company, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: company?.name ?? '',
    sector: company?.sector ?? '',
    website: company?.website ?? '',
    contact_email: company?.contact_email ?? '',
    description: company?.description ?? '',
    current_valuation: company?.current_valuation ?? '',
    current_fundraise: company?.current_fundraise ?? '',
  })

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      sector: form.sector || null,
      website: form.website || null,
      contact_email: form.contact_email || null,
      description: form.description || null,
      current_valuation: form.current_valuation || null,
      current_fundraise: form.current_fundraise || null,
    }

    let result
    if (company) {
      result = await supabase.from('portfolio_companies').update(payload).eq('id', company.id).select().single()
    } else {
      result = await supabase.from('portfolio_companies').insert(payload).select().single()
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    onSaved(result.data as PortfolioCompany)
  }

  const fields = [
    { name: 'name', label: 'Company Name', type: 'text', required: true },
    { name: 'sector', label: 'Sector / Therapeutic Area', type: 'text' },
    { name: 'website', label: 'Website', type: 'url' },
    { name: 'contact_email', label: 'Contact Email', type: 'email' },
    { name: 'current_valuation', label: 'Current Valuation', type: 'text' },
    { name: 'current_fundraise', label: 'Current Fundraising Need', type: 'text' },
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <input
                type={field.type}
                required={field.required}
                value={(form as Record<string, string>)[field.name]}
                onChange={(e) => set(field.name, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
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
