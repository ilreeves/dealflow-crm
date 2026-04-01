'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Save, X, Loader2 } from 'lucide-react'
import { CustomFieldDefinition, CustomFieldType } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'boolean', label: 'Yes / No' },
]

interface NewFieldState {
  label: string
  field_type: CustomFieldType
  options: string
  required: boolean
}

export default function SettingsPage() {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newField, setNewField] = useState<NewFieldState>({
    label: '',
    field_type: 'text',
    options: '',
    required: false,
  })
  const supabase = createClient()

  useEffect(() => {
    loadFields()
  }, [])

  async function loadFields() {
    setLoading(true)
    const { data } = await supabase
      .from('custom_field_definitions')
      .select('*')
      .order('sort_order')
    setFields((data as CustomFieldDefinition[]) ?? [])
    setLoading(false)
  }

  function toSnakeCase(str: string) {
    return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  }

  async function handleAddField(e: React.FormEvent) {
    e.preventDefault()
    if (!newField.label.trim()) return
    setSaving(true)
    setError('')

    const name = toSnakeCase(newField.label)
    const options = newField.field_type === 'select'
      ? newField.options.split(',').map((o) => o.trim()).filter(Boolean)
      : null

    const { data, error: err } = await supabase
      .from('custom_field_definitions')
      .insert({
        name,
        label: newField.label.trim(),
        field_type: newField.field_type,
        options,
        required: newField.required,
        sort_order: fields.length,
      })
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else {
      setFields((prev) => [...prev, data as CustomFieldDefinition])
      setShowForm(false)
      setNewField({ label: '', field_type: 'text', options: '', required: false })
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('custom_field_definitions').delete().eq('id', id)
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage custom fields for your deals</p>
      </div>

      {/* Custom Fields */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Custom Fields</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Extra fields that appear on every deal form
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleAddField} className="px-5 py-4 border-b border-slate-100 bg-slate-50 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Custom Field</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                <input
                  type="text"
                  required
                  value={newField.label}
                  onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. ARR, Geography"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={newField.field_type}
                  onChange={(e) => setNewField((p) => ({ ...p, field_type: e.target.value as CustomFieldType }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {newField.field_type === 'select' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Options <span className="text-slate-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={newField.options}
                  onChange={(e) => setNewField((p) => ({ ...p, options: e.target.value }))}
                  placeholder="Option A, Option B, Option C"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newField.required}
                onChange={(e) => setNewField((p) => ({ ...p, required: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-600">Required field</span>
            </label>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Field
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 transition"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Fields list */}
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : fields.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-slate-400">No custom fields yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add fields to capture extra data on your deals.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {fields.map((field) => (
              <div key={field.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition group">
                <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-red-500 font-medium">Required</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 capitalize">{field.field_type}</span>
                    {field.options && field.options.length > 0 && (
                      <span className="text-xs text-slate-400">
                        · {field.options.join(', ')}
                      </span>
                    )}
                    <span className="text-xs text-slate-300">· key: {field.name}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(field.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title="Delete field"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="mt-4 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
        <p className="text-xs text-blue-700">
          <strong>Note:</strong> Custom fields are added to the deal form for all deals. Existing deals will show the field as empty until filled in. Deleting a field removes it from the form but does not delete data already saved.
        </p>
      </div>
    </div>
  )
}
