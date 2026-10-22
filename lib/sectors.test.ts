import { describe, it, expect } from "vitest"
import { allSectors, formatSectors, sectorsPayload } from "./sectors"

describe("sectors", () => {
  it("lists primary first and drops blanks and repeats", () => {
    expect(allSectors({ sector: "Psych", secondary_sectors: ["GI", " ", "Psych", "GI"] })).toEqual(["Psych", "GI"])
    expect(allSectors({ sector: null })).toEqual([])
    expect(formatSectors({ sector: "Psych", secondary_sectors: ["GI"] })).toBe("Psych · GI")
    expect(formatSectors({ sector: null, secondary_sectors: [] })).toBeNull()
  })

  it("never saves the primary as a secondary", () => {
    expect(sectorsPayload("Psych", ["GI", "Psych"])).toEqual({ sector: "Psych", secondary_sectors: ["GI"] })
  })

  it("promotes the first secondary when the primary is cleared", () => {
    expect(sectorsPayload("", ["GI", "Cardio"])).toEqual({ sector: "GI", secondary_sectors: ["Cardio"] })
    expect(sectorsPayload("", [])).toEqual({ sector: null, secondary_sectors: [] })
  })
})
