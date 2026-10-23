import { describe, it, expect } from "vitest"
import type { Program } from "./types"
import {
  DRUG_PHASES, DEVICE_PHASES, MAP_COLUMNS, phaseColumn, phasesFor, toMapProgram, buildMap, knownIndications, normalizeWebsite,
  type OwnerLookups, type MapProgram,
} from "./programs"

function prog(over: Partial<Program>): Program {
  return {
    id: Math.random().toString(36).slice(2), company_id: null, deal_id: null, company_name: "Ext Co",
    intervention: "X-1", mechanism: null, modality: "Small molecule", indication: "Heart failure",
    therapeutic_area: "Cardiovascular", specialty: null, phase: "Phase 2", status: "Active", source: null, notes: null, website: null,
    needs_review: false, created_by: null, created_at: "", updated_at: "", ...over,
  }
}

const lookups: OwnerLookups = {
  portfolio: new Map([["co1", { name: "Intershunt", status: "Active" }]]),
  deals: new Map([
    ["d1", { name: "Attune", stage: "Sourced" }],
    ["d2", { name: "OldCo", stage: "Passed" }],
    ["d3", { name: "Aurenar", stage: "Invested" }],
  ]),
}

const asMap = (ps: Program[]) => ps.map((p) => toMapProgram(p, lookups)).filter((p): p is MapProgram => p !== null)

describe("phase ladders", () => {
  it("every label on both ladders maps to a column, ordered along the ladder", () => {
    for (const ladder of [DRUG_PHASES, DEVICE_PHASES]) {
      const cols = ladder.map(phaseColumn)
      expect(cols.every((c) => c >= 0 && c < MAP_COLUMNS.length)).toBe(true)
      expect([...cols].sort((a, b) => a - b)).toEqual(cols)
      expect(cols[0]).toBe(0)
      expect(cols[cols.length - 1]).toBe(MAP_COLUMNS.length - 1)
    }
  })

  it("puts drug and device peers in the same column", () => {
    expect(phaseColumn("Phase 3")).toBe(phaseColumn("Pivotal"))
    expect(phaseColumn("Phase 1")).toBe(phaseColumn("First-in-human"))
    expect(phaseColumn("Filed")).toBe(phaseColumn("Submitted"))
    expect(phaseColumn("Approved")).toBe(phaseColumn("Marketed"))
  })

  it("picks the ladder from the modality", () => {
    expect(phasesFor("Biologic")).toBe(DRUG_PHASES)
    expect(phasesFor("Diagnostic")).toBe(DEVICE_PHASES)
  })
})

describe("toMapProgram", () => {
  it("resolves owners and deep links", () => {
    const [pf, pl, ps, ex] = asMap([
      prog({ company_id: "co1", company_name: null }),
      prog({ deal_id: "d1", company_name: null }),
      prog({ deal_id: "d2", company_name: null }),
      prog({}),
    ])
    expect([pf.owner, pl.owner, ps.owner, ex.owner]).toEqual(["portfolio", "pipeline", "passed", "external"])
    expect(pf.href).toBe("/portfolio?open=co1")
    expect(pl.href).toBe("/?open=d1")
    expect(ex.href).toBeNull()
    expect(pf.legacy).toBe(false)
  })

  it("flags programs of Legacy / Exited portfolio companies", () => {
    const legacyLookups: OwnerLookups = { ...lookups, portfolio: new Map([["co2", { name: "Knopp", status: "Legacy" }]]) }
    expect(toMapProgram(prog({ company_id: "co2", company_name: null }), legacyLookups)?.legacy).toBe(true)
  })

  it("drops invested deals (the portfolio company carries them) and unknown parents", () => {
    expect(asMap([prog({ deal_id: "d3", company_name: null }), prog({ company_id: "gone", company_name: null })])).toEqual([])
  })
})

describe("buildMap", () => {
  it("merges indication spellings, orders areas, and sorts Solas-first within a cell", () => {
    const groups = buildMap(asMap([
      prog({ company_name: "Zed", indication: "heart  failure", phase: "Pivotal", modality: "Device" }),
      prog({ company_id: "co1", company_name: null, indication: "Heart failure", phase: "Phase 3" }),
      prog({ company_name: "Onc", indication: "Breast cancer", therapeutic_area: "Oncology" }),
    ]))
    expect(groups.map((g) => g.area)).toEqual(["Cardiovascular", "Oncology"])
    const hf = groups[0].rows
    expect(hf).toHaveLength(1)
    expect(hf[0].oursCount).toBe(1)
    const late = hf[0].cells[phaseColumn("Phase 3")]
    expect(late.map((p) => p.companyLabel)).toEqual(["Intershunt", "Zed"])
  })

  it("lists indications where Solas plays before bigger competitor-only rows", () => {
    const groups = buildMap(asMap([
      prog({ indication: "A" }), prog({ indication: "A" }), prog({ indication: "A" }),
      prog({ deal_id: "d1", company_name: null, indication: "B" }),
    ]))
    expect(groups[0].rows.map((r) => r.indication)).toEqual(["B", "A"])
  })
})

it("knownIndications dedupes case-insensitively", () => {
  expect(knownIndications([{ indication: "Heart failure" }, { indication: "heart failure " }, { indication: "AF" }]))
    .toEqual(["AF", "Heart failure"])
})

it("normalizeWebsite adds https:// only when there's no scheme", () => {
  expect(normalizeWebsite(" acme.com ")).toBe("https://acme.com")
  expect(normalizeWebsite("http://acme.com")).toBe("http://acme.com")
  expect(normalizeWebsite("  ")).toBeNull()
})
