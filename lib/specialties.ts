// How a program's therapeutic area (the DISEASE axis — what the market map
// groups rows by) relates to the ABMS specialty list (the WHO-TREATS-IT axis —
// what a company's sector uses). They don't nest: stroke is Neurology as a
// disease, but a thrombectomy device is bought by Neurological Surgery and a
// thrombolytic is prescribed under Psychiatry & Neurology. So each program
// carries both, and this table only supplies the starting guess.
//
// No imports on purpose: the backfill script and the tests read it directly.
// Every specialty named here must be on ABMS_SPECIALTIES (lib/listOptions.ts);
// lib/specialties.test.ts enforces that.

export interface AreaSpecialties {
  /** Where a program in this area lands when nothing better is known. */
  default: string
  /** Specialties that legitimately own programs in this area. A company whose
   *  primary sector is one of these passes it on to its programs here. */
  related: readonly string[]
}

export const AREA_SPECIALTIES: Record<string, AreaSpecialties> = {
  'Cardiovascular': {
    default: 'IM - Cardiovascular Disease',
    related: ['IM - Advanced Heart Failure & Transplant Cardiology', 'IM - Clinical Cardiac Electrophysiology', 'IM - Interventional Cardiology', 'Thoracic Surgery', 'Surgery'],
  },
  'Neurology': {
    default: 'Psychiatry & Neurology',
    related: ['Neurological Surgery', 'IM - Critical Care Medicine', 'Physical Medicine & Rehabilitation', 'Pediatrics'],
  },
  'Psychiatry': { default: 'Psychiatry & Neurology', related: ['Neurological Surgery'] },
  'Oncology': {
    default: 'IM - Medical Oncology',
    related: ['IM - Hematology', 'Urology', 'Dermatology', 'Thoracic Surgery', 'Surgery', 'Colon & Rectal Surgery', 'Neurological Surgery', 'Obstetrics & Gynecology', 'IM - Pulmonary Disease', 'IM - Gastroenterology', 'Radiology', 'Nuclear Medicine', 'Pathology'],
  },
  'Pulmonary & critical care': {
    default: 'IM - Pulmonary Disease',
    related: ['IM - Critical Care Medicine', 'Thoracic Surgery', 'Allergy & Immunology', 'Emergency Medicine', 'Anesthesiology'],
  },
  'Gastroenterology & hepatology': { default: 'IM - Gastroenterology', related: ['Colon & Rectal Surgery', 'Surgery'] },
  'Urology & nephrology': { default: 'Urology', related: ['IM - Nephrology'] },
  "Women's health": { default: 'Obstetrics & Gynecology', related: ['Urology', 'Pediatrics'] },
  'Dermatology': { default: 'Dermatology', related: ['Plastic Surgery'] },
  'ENT & sleep': { default: 'Otolaryngology - Head and Neck Surgery', related: ['IM - Sleep Medicine', 'IM - Pulmonary Disease'] },
  'Immunology & inflammation': { default: 'Allergy & Immunology', related: ['IM - Rheumatology', 'Dermatology', 'IM - Gastroenterology'] },
  'Metabolic & endocrine': { default: 'IM - Endocrinology, Diabetes & Metabolism', related: ['Internal Medicine (General)', 'Family Medicine', 'Pediatrics'] },
  'Musculoskeletal & pain': {
    default: 'Orthopaedic Surgery',
    related: ['Anesthesiology', 'Physical Medicine & Rehabilitation', 'IM - Rheumatology', 'Psychiatry & Neurology', 'Neurological Surgery', 'Plastic Surgery'],
  },
  'Infectious disease': { default: 'IM - Infectious Disease', related: ['Preventive Medicine', 'Pediatrics'] },
  'Ophthalmology': { default: 'Ophthalmology', related: [] },
  'Hematology': { default: 'IM - Hematology', related: ['IM - Medical Oncology'] },
  'Other': { default: 'Internal Medicine (General)', related: [] },
}

// Indications whose owning specialty differs from their area's default —
// pain is Musculoskeletal by area but Anesthesiology (pain medicine) by who
// treats it. Keyed case-insensitively.
export const INDICATION_SPECIALTY: Record<string, string> = {
  'chronic pain': 'Anesthesiology',
  'painful diabetic peripheral neuropathy': 'Anesthesiology',
  'inherited erythromelalgia': 'Anesthesiology',
  'heart failure': 'IM - Advanced Heart Failure & Transplant Cardiology',
  'atrial fibrillation': 'IM - Clinical Cardiac Electrophysiology',
  'ventricular tachycardia': 'IM - Clinical Cardiac Electrophysiology',
  'acute myocardial infarction': 'IM - Interventional Cardiology',
  'obstructive sleep apnea': 'IM - Sleep Medicine',
  'acute kidney injury': 'IM - Nephrology',
  'end-stage renal disease': 'IM - Nephrology',
  'autosomal dominant polycystic kidney disease': 'IM - Nephrology',
  'ventilator weaning': 'IM - Critical Care Medicine',
  'hemorrhagic shock': 'IM - Critical Care Medicine',
  'targeted temperature management': 'IM - Critical Care Medicine',
  'cardiogenic shock': 'IM - Interventional Cardiology',
  'high-risk percutaneous coronary intervention': 'IM - Interventional Cardiology',
}

const DRUG_MODALITIES = new Set(['Small molecule', 'Biologic', 'Nucleic acid', 'Cell & gene therapy'])

export interface SpecialtyPeer {
  indication: string
  modality: string
  specialty: string | null
  /** Portfolio programs win ties over deal programs. */
  fromPortfolio?: boolean
}

/**
 * Starting guess for a program's specialty, in order:
 *  1. the owning company's primary sector, if it's related to this area
 *     (Francis = Urology → its prostate-cancer program is Urology, not Oncology);
 *  2. for a company with no usable sector (competitors), the specialty Solas
 *     programs already use for the same indication AND the same drug/device
 *     class (stroke devices follow Vesalio, stroke drugs follow Basking) —
 *     most common wins, a portfolio company breaks a tie;
 *  3. a per-indication override; 4. the area default.
 */
export function suggestSpecialty(
  p: { therapeutic_area: string; indication: string; modality: string },
  companySector: string | null,
  peers: readonly SpecialtyPeer[] = [],
): string {
  const area = AREA_SPECIALTIES[p.therapeutic_area] ?? AREA_SPECIALTIES['Other']
  const sector = companySector?.trim()
  if (sector && (sector === area.default || area.related.includes(sector))) return sector

  if (!sector && peers.length) {
    const key = p.indication.trim().toLowerCase()
    const drug = DRUG_MODALITIES.has(p.modality)
    const tally = new Map<string, { n: number; portfolio: boolean }>()
    for (const peer of peers) {
      if (!peer.specialty || peer.indication.trim().toLowerCase() !== key) continue
      if (DRUG_MODALITIES.has(peer.modality) !== drug) continue
      const t = tally.get(peer.specialty) ?? { n: 0, portfolio: false }
      t.n++
      t.portfolio ||= !!peer.fromPortfolio
      tally.set(peer.specialty, t)
    }
    const ranked = Array.from(tally.entries()).sort(([sa, a], [sb, b]) =>
      b.n - a.n || Number(b.portfolio) - Number(a.portfolio) || sa.localeCompare(sb))
    if (ranked.length) return ranked[0][0]
  }

  return INDICATION_SPECIALTY[p.indication.trim().toLowerCase()] ?? area.default
}
