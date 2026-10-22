import { describe, it, expect, vi } from "vitest"

// listOptions imports the browser Supabase client; only the constant is needed.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))

import { ABMS_SPECIALTIES } from "./listOptions"
import { THERAPEUTIC_AREAS } from "./programs"
import { AREA_SPECIALTIES, INDICATION_SPECIALTY, suggestSpecialty } from "./specialties"

const abms = new Set<string>(ABMS_SPECIALTIES)
const prog = (therapeutic_area: string, indication: string, modality = "Device") => ({ therapeutic_area, indication, modality })

describe("specialty mapping", () => {
  it("covers every therapeutic area, using only ABMS specialties", () => {
    for (const area of THERAPEUTIC_AREAS) {
      const m = AREA_SPECIALTIES[area]
      expect(m, area).toBeDefined()
      expect(abms.has(m.default), m.default).toBe(true)
      for (const r of m.related) expect(abms.has(r), r).toBe(true)
    }
    for (const s of Object.values(INDICATION_SPECIALTY)) expect(abms.has(s), s).toBe(true)
  })
})

describe("suggestSpecialty", () => {
  it("passes on a company sector that's related to the area", () => {
    expect(suggestSpecialty(prog("Oncology", "Prostate cancer"), "Urology")).toBe("Urology")
    expect(suggestSpecialty(prog("Neurology", "Acute ischemic stroke"), "Neurological Surgery")).toBe("Neurological Surgery")
  })

  it("ignores an unrelated company sector — Arrivo's GI asset isn't Psychiatry", () => {
    expect(suggestSpecialty(prog("Gastroenterology & hepatology", "Acute pancreatitis", "Small molecule"), "Psychiatry & Neurology"))
      .toBe("IM - Gastroenterology")
  })

  it("uses indication overrides before the area default", () => {
    expect(suggestSpecialty(prog("Musculoskeletal & pain", "Chronic pain"), "Medical Genetics and Genomics")).toBe("Anesthesiology")
    expect(suggestSpecialty(prog("Musculoskeletal & pain", "Rotator cuff tear"), null)).toBe("Orthopaedic Surgery")
  })

  it("lets a competitor follow Solas peers in the same indication and drug/device class", () => {
    const peers = [
      { indication: "Acute ischemic stroke", modality: "Device", specialty: "Neurological Surgery", fromPortfolio: true },
      { indication: "Acute ischemic stroke", modality: "Nucleic acid", specialty: "Psychiatry & Neurology", fromPortfolio: true },
    ]
    expect(suggestSpecialty(prog("Neurology", "Acute ischemic stroke", "Device"), null, peers)).toBe("Neurological Surgery")
    expect(suggestSpecialty(prog("Neurology", "acute ischemic stroke ", "Biologic"), null, peers)).toBe("Psychiatry & Neurology")
  })

  it("breaks a peer tie toward the portfolio company", () => {
    const peers = [
      { indication: "Prostate cancer", modality: "Device", specialty: "IM - Medical Oncology", fromPortfolio: false },
      { indication: "Prostate cancer", modality: "Device", specialty: "Urology", fromPortfolio: true },
    ]
    expect(suggestSpecialty(prog("Oncology", "Prostate cancer"), null, peers)).toBe("Urology")
  })
})
