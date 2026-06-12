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

export default function PortfolioCompanyForm({ company, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: company?.name ?? '',
    sector: company?.sector ?? '',
    category: company?.category ?? '',
    funds: company?.funds ?? [] as string[],
    series: company?.series ?? '',
    clinical_stage: company?.clinical_stage ?? '',
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
      funds: form.funds.length ? form.funds : null,
      series: form.series || null,
      clinical_stage: form.clinical_stage || null,
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
    { name: 'sector', label: 'Sector / Therapeutic Area', type: 'select', options: ABMS_SPECIALTIES },
    { name: 'series', label: 'Series', type: 'select', options: ['Pre-Seed', 'Seed', 'Convertible Note/SAFE', 'A', 'B', 'C', 'D+'] },
    { name: 'clinical_stage', label: 'Clinical Stage', type: 'select', options: ['Preclinical', 'Pre-IND', 'Phase I', 'Phase II', 'Phase III', 'Pre-IDE', 'FIH', 'Pivotal', '510(k)', 'PMA', 'Approved / Marketed'] },
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                  {(form as unknown as Record<string, string>)[field.name] && !(field.options ?? []).includes((form as unknown as Record<string, string>)[field.name]) && (
                    <option value={(form as unknown as Record<string, string>)[field.name]}>{(form as unknown as Record<string, string>)[field.name]}</option>
                  )}
                  {(field.options ?? []).map((opt: string) => (
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fund / Vehicle</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['Fund I', 'Fund II', 'EHF', 'Solas/Sower', 'SPV'].map((fund) => (
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
