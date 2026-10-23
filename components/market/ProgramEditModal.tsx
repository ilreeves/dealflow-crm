'use client'

import { useState } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { Program } from '@/lib/types'
import { MODALITIES, THERAPEUTIC_AREAS, phasesFor, isDrugModality, normalizeWebsite } from '@/lib/programs'
import { suggestSpecialty, SpecialtyPeer } from '@/lib/specialties'
import { ABMS_SPECIALTIES } from '@/lib/listOptions'
import { createClient } from '@/lib/supabase/client'

export type ProgramOwnerRef =
  | { kind: 'portfolio'; id: string }
  | { kind: 'deal'; id: string }
  | { kind: 'external'; name: string }

export interface OwnerOption { id: string; name: string; sector: string | null }

interface Props {
  /** Existing program to edit, or null to add one. */
  program: Program | null
  /** Pin the owner (used from a company's own Programs section). */
  fixedOwner?: ProgramOwnerRef
  /** Shown as the sheet title when the owner is pinned. */
  ownerName?: string
  /** Owner choices for the map's "Add program" (ignored when fixedOwner is set). */
  portfolioOptions?: OwnerOption[]
  dealOptions?: OwnerOption[]
  /** Pinned owner's primary sector — seeds the specialty suggestion. */
  ownerSector?: string | null
  /** Indications already in use — suggested so new rows join existing map rows. */
  indicationSuggestions: string[]
  /** Existing programs; a competitor's specialty follows Solas programs in the same indication. */
  peers?: SpecialtyPeer[]
  onClose: () => void
  onSaved: (p: Program) => void
  onDeleted: (id: string) => void
}

const input = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white'

function ownerOf(p: Program): ProgramOwnerRef {
  if (p.company_id) return { kind: 'portfolio', id: p.company_id }
  if (p.deal_id) return { kind: 'deal', id: p.deal_id }
  return { kind: 'external', name: p.company_name ?? '' }
}

// Owner as one select value: "portfolio:<id>", "deal:<id>" or "external".
function encodeOwner(o: ProgramOwnerRef | undefined): string {
  if (!o) return ''
  return o.kind === 'external' ? 'external' : `${o.kind}:${o.id}`
}

export default function ProgramEditModal({
  program, fixedOwner, ownerName, ownerSector = null, portfolioOptions = [], dealOptions = [], indicationSuggestions, peers = [], onClose, onSaved, onDeleted,
}: Props) {
  const supabase = createClient()
  const initialOwner = fixedOwner ?? (program ? ownerOf(program) : undefined)
  const [ownerValue, setOwnerValue] = useState(encodeOwner(initialOwner))
  const [externalName, setExternalName] = useState(initialOwner?.kind === 'external' ? initialOwner.name : '')
  const [website, setWebsite] = useState(program?.website ?? '')
  const [form, setForm] = useState({
    intervention: program?.intervention ?? '',
    mechanism: program?.mechanism ?? '',
    modality: program?.modality ?? 'Small molecule',
    indication: program?.indication ?? '',
    therapeutic_area: program?.therapeutic_area ?? '',
    specialty: program?.specialty ?? '',
    phase: program?.phase ?? 'Preclinical',
    status: program?.status ?? 'Active',
    source: program?.source ?? '',
    notes: program?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const phases = phasesFor(form.modality)

  // Specialty follows a suggestion (owner's sector → Solas peers → area
  // default) until the user picks one themselves; after that it's left alone.
  // An existing row's specialty counts as picked.
  const [specialtyTouched, setSpecialtyTouched] = useState(!!program?.specialty)
  const currentOwnerSector = (): string | null => {
    if (ownerValue === 'external') return null
    if (fixedOwner) return ownerSector
    const [kind, id] = ownerValue.split(':')
    return (kind === 'portfolio' ? portfolioOptions : dealOptions).find((o) => o.id === id)?.sector ?? null
  }
  const suggested = form.therapeutic_area
    ? suggestSpecialty(form, currentOwnerSector(), peers)
    : ''
  const specialty = specialtyTouched ? form.specialty : suggested

  // Switching between a drug and a device modality changes the ladder; keep
  // the phase only if it exists on the new one (Preclinical is on both).
  function setModality(modality: string) {
    setForm((f) => ({
      ...f,
      modality,
      phase: phasesFor(modality).includes(f.phase) ? f.phase : 'Preclinical',
    }))
  }

  const ownerFields = (): Record<string, string | null> | null => {
    if (ownerValue === 'external') {
      const name = externalName.trim()
      return name ? { company_id: null, deal_id: null, company_name: name } : null
    }
    const [kind, id] = ownerValue.split(':')
    if (!id) return null
    return kind === 'portfolio'
      ? { company_id: id, deal_id: null, company_name: null }
      : { company_id: null, deal_id: id, company_name: null }
  }

  const owner = ownerFields()
  const isExternal = ownerValue === 'external'
  // Competitors need a website: one that can't be found doesn't go on the map.
  const canSave = !!owner && !!form.intervention.trim() && !!form.indication.trim() && !!form.therapeutic_area &&
    (!isExternal || !!website.trim())

  async function handleSave() {
    if (!canSave || !owner) return
    setSaving(true)
    setError('')
    const payload = {
      ...owner,
      intervention: form.intervention.trim(),
      mechanism: form.mechanism.trim() || null,
      modality: form.modality,
      indication: form.indication.trim(),
      therapeutic_area: form.therapeutic_area,
      specialty: specialty || null,
      phase: form.phase,
      status: form.status,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
      website: isExternal ? normalizeWebsite(website) : null,
      // A save from the app is a person standing behind the row.
      needs_review: false,
    }
    const res = program
      ? await supabase.from('programs').update(payload).eq('id', program.id).select().single()
      : await supabase.from('programs').insert(payload).select().single()
    if (res.error || !res.data) {
      setError(`Couldn't save: ${res.error?.message ?? 'no row returned'}`)
      setSaving(false)
      return
    }
    onSaved(res.data as Program)
    onClose()
  }

  async function handleDelete() {
    if (!program) return
    if (!window.confirm(`Delete ${program.intervention} — ${program.indication}?`)) return
    setDeleting(true)
    setError('')
    const { error: e } = await supabase.from('programs').delete().eq('id', program.id)
    if (e) {
      setError(`Couldn't delete: ${e.message}`)
      setDeleting(false)
      return
    }
    onDeleted(program.id)
    onClose()
  }

  return (
    // Full-screen sheet on phones (max-md) with a scrolling body; md+ is a centred dialog.
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 max-md:p-0" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg md:max-h-[90vh] flex flex-col max-md:max-w-none max-md:h-dvh max-md:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {ownerName ?? (program ? 'Edit program' : 'Add program')}
            </h2>
            {ownerName && <p className="text-xs text-slate-400">{program ? 'Edit program' : 'New program'}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          {program?.needs_review && (
            <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200">
              Drafted from research and not yet reviewed. Saving marks it reviewed.
            </p>
          )}

          {!fixedOwner && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Company *</label>
              <select value={ownerValue} onChange={(e) => setOwnerValue(e.target.value)} className={input}>
                <option value="">Choose…</option>
                <option value="external">External company (competitor)…</option>
                {portfolioOptions.length > 0 && (
                  <optgroup label="Portfolio">
                    {portfolioOptions.map((o) => <option key={o.id} value={`portfolio:${o.id}`}>{o.name}</option>)}
                  </optgroup>
                )}
                {dealOptions.length > 0 && (
                  <optgroup label="Deals">
                    {dealOptions.map((o) => <option key={o.id} value={`deal:${o.id}`}>{o.name}</option>)}
                  </optgroup>
                )}
              </select>
              {ownerValue === 'external' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <input autoFocus placeholder="Company name *" value={externalName} onChange={(e) => setExternalName(e.target.value)} className={input} />
                  <input type="url" placeholder="Website *" value={website} onChange={(e) => setWebsite(e.target.value)} className={input} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Intervention *</label>
              <input placeholder="e.g. SP-624, NeVa" value={form.intervention} onChange={(e) => setForm((f) => ({ ...f, intervention: e.target.value }))} className={input} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Modality</label>
              <select value={form.modality} onChange={(e) => setModality(e.target.value)} className={input}>
                {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Mechanism / technology</label>
            <input placeholder="e.g. SIRT6 activator, water-vapor ablation" value={form.mechanism} onChange={(e) => setForm((f) => ({ ...f, mechanism: e.target.value }))} className={input} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Indication *</label>
              <input list="program-indications" placeholder="e.g. Heart failure" value={form.indication} onChange={(e) => setForm((f) => ({ ...f, indication: e.target.value }))} className={input} />
              <datalist id="program-indications">
                {indicationSuggestions.map((i) => <option key={i} value={i} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Therapeutic area *</label>
              <select value={form.therapeutic_area} onChange={(e) => setForm((f) => ({ ...f, therapeutic_area: e.target.value }))} className={input}>
                <option value="">Choose…</option>
                {THERAPEUTIC_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Specialty <span className="text-slate-400">(who treats it — rolls up to the company&apos;s sectors)</span>
            </label>
            <select
              value={specialty}
              onChange={(e) => { setSpecialtyTouched(true); setForm((f) => ({ ...f, specialty: e.target.value })) }}
              disabled={!form.therapeutic_area}
              className={`${input} disabled:opacity-50`}
            >
              {!specialty && <option value="">{form.therapeutic_area ? 'Choose…' : 'Pick a therapeutic area first'}</option>}
              {specialty && !(ABMS_SPECIALTIES as readonly string[]).includes(specialty) && <option value={specialty}>{specialty}</option>}
              {ABMS_SPECIALTIES.map((s) => <option key={s} value={s}>{s}{s === suggested && specialtyTouched && s !== specialty ? ' (suggested)' : ''}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Phase <span className="text-slate-400">({isDrugModality(form.modality) ? 'drug' : 'device'} ladder)</span>
              </label>
              <select value={form.phase} onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))} className={input}>
                {phases.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Program['status'] }))} className={input}>
                <option value="Active">Active</option>
                <option value="Discontinued">Discontinued</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Source</label>
            <input placeholder="NCT id, URL, deck…" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className={input} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={`${input} resize-none`} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mx-5 mb-3">{error}</p>}

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
          {program && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-50">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: '#023a51' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {program?.needs_review ? 'Save & mark reviewed' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
