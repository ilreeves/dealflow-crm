import { describe, it, expect } from "vitest"
import {
  renameError, replaceFundTag, pgArrayLiteral, isMissingRpc, parseRenameCounts, totalCount, FUND_NAME_COLUMNS,
} from "./fundRename"

const LISTS = ["Fund I", "Fund II", "EHF", "Sower Solas II", "SPV", "Cryosa Sidecar", "Basking Holdings"]

describe("renameError", () => {
  it("accepts a fresh name", () => {
    expect(renameError("Fund II", "Solas Fund II", LISTS)).toBeNull()
  })

  it("refuses blank, whitespace and unchanged names", () => {
    expect(renameError("Fund II", "", LISTS)).toMatch(/enter a new name/i)
    expect(renameError("Fund II", "   ", LISTS)).toMatch(/enter a new name/i)
    expect(renameError("Fund II", "  Fund II  ", LISTS)).toMatch(/current name/i)
  })

  it("refuses a name that already exists, case-insensitively — that's a merge", () => {
    expect(renameError("Fund II", "EHF", LISTS)).toMatch(/“EHF” already exists/)
    expect(renameError("Fund II", "ehf", LISTS)).toMatch(/“EHF” already exists/)
    // An SPV-list name counts too: spv_fund shares the fund namespace.
    expect(renameError("Fund II", "basking holdings", LISTS)).toMatch(/Basking Holdings/)
  })

  it("allows a case-only fix of the fund's own name", () => {
    expect(renameError("Fund Ii", "Fund II", ["Fund I", "Fund Ii", "EHF"])).toBeNull()
  })

  it("refuses over-long names", () => {
    expect(renameError("Fund II", "x".repeat(101), LISTS)).toMatch(/100 characters/)
    expect(renameError("Fund II", "x".repeat(100), LISTS)).toBeNull()
  })
})

describe("replaceFundTag", () => {
  it("replaces in place and preserves order", () => {
    expect(replaceFundTag(["Fund II", "Solas/Sower", "Cryosa Sidecar"], "Solas/Sower", "Sower Solas II"))
      .toEqual(["Fund II", "Sower Solas II", "Cryosa Sidecar"])
  })

  it("dedupes when the company already carries the new tag, keeping the first", () => {
    expect(replaceFundTag(["Sower Solas II", "Fund II", "Solas/Sower"], "Solas/Sower", "Sower Solas II"))
      .toEqual(["Sower Solas II", "Fund II"])
    expect(replaceFundTag(["Solas/Sower", "Fund II", "Sower Solas II"], "Solas/Sower", "Sower Solas II"))
      .toEqual(["Sower Solas II", "Fund II"])
  })

  it("collapses a repeated old tag", () => {
    expect(replaceFundTag(["EHF", "EHF"], "EHF", "Emerging Health Fund")).toEqual(["Emerging Health Fund"])
  })

  it("leaves arrays without the old tag alone (exact match only)", () => {
    expect(replaceFundTag(["Fund I", "fund ii"], "Fund II", "X")).toEqual(["Fund I", "fund ii"])
    expect(replaceFundTag([], "Fund II", "X")).toEqual([])
  })
})

describe("pgArrayLiteral", () => {
  it("quotes each element", () => {
    expect(pgArrayLiteral(["Solas/Sower"])).toBe('{"Solas/Sower"}')
    expect(pgArrayLiteral(["Fund I", "Fund II"])).toBe('{"Fund I","Fund II"}')
  })

  it("survives commas, braces, quotes and backslashes", () => {
    expect(pgArrayLiteral(['A, B'])).toBe('{"A, B"}')
    expect(pgArrayLiteral(['{x}'])).toBe('{"{x}"}')
    expect(pgArrayLiteral(['say "hi"'])).toBe('{"say \\"hi\\""}')
    expect(pgArrayLiteral(['a\\b'])).toBe('{"a\\\\b"}')
  })
})

describe("isMissingRpc", () => {
  it("recognises PostgREST's missing-function error", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "Could not find the function public.rename_fund(new_name, old_name) in the schema cache" })).toBe(true)
    expect(isMissingRpc({ message: "Could not find the function public.rename_fund" })).toBe(true)
    expect(isMissingRpc({ code: "42883", message: "function rename_fund(text, text) does not exist" })).toBe(true)
  })

  it("does not swallow real errors", () => {
    expect(isMissingRpc({ code: "P0001", message: '"EHF" is already used in the Fund / Vehicle list.' })).toBe(false)
    expect(isMissingRpc(null)).toBe(false)
  })
})

describe("parseRenameCounts / totalCount", () => {
  it("reads every column key and defaults missing ones to 0", () => {
    const c = parseRenameCounts({ old_name: "A", new_name: "B", list_options_fund: 1, portfolio_positions_fund: 5, portfolio_companies_funds: "5" })
    expect(c.list_options_fund).toBe(1)
    expect(c.portfolio_positions_fund).toBe(5)
    expect(c.portfolio_companies_funds).toBe(5)
    expect(c.fund_snapshots_fund).toBe(0)
    expect(Object.keys(c)).toHaveLength(FUND_NAME_COLUMNS.length)
    expect(totalCount(c)).toBe(11)
  })

  it("tolerates garbage", () => {
    expect(totalCount(parseRenameCounts(null))).toBe(0)
    expect(totalCount(parseRenameCounts({ list_options_fund: "nope" }))).toBe(0)
  })
})
