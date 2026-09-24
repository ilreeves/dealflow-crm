import { describe, it, expect } from "vitest"
import { safeStorageName } from "./storage"

describe("safeStorageName", () => {
  it("leaves an already-safe name alone", () => {
    expect(safeStorageName("Series B Deck (v2).pdf")).toBe("Series B Deck (v2).pdf")
  })

  it("strips diacritics instead of replacing the letter", () => {
    expect(safeStorageName("Présentation Série A.pdf")).toBe("Presentation Serie A.pdf")
  })

  it("replaces en-dashes, brackets and other disallowed characters", () => {
    expect(safeStorageName("Deck – Series B [final].pdf")).toBe("Deck _ Series B _final.pdf")
  })

  it("collapses repeated replacements and spaces", () => {
    expect(safeStorageName("a###b    c.pdf")).toBe("a_b c.pdf")
  })

  it("keeps the extension", () => {
    expect(safeStorageName("model 🚀 v3.xlsx")).toBe("model _ v3.xlsx")
    expect(safeStorageName("archive.tar.gz")).toBe("archive.tar.gz")
  })

  it("never returns an empty base", () => {
    expect(safeStorageName("")).toBe("file")
    expect(safeStorageName("🚀🚀.pdf")).toBe("file.pdf")
    expect(safeStorageName(".pdf")).toBe("file.pdf")
    expect(safeStorageName("…")).toBe("file")
  })

  it("handles names with no extension", () => {
    expect(safeStorageName("README")).toBe("README")
  })

  it("caps a very long base but keeps the extension", () => {
    const out = safeStorageName(`${"x".repeat(500)}.pdf`)
    expect(out.endsWith(".pdf")).toBe(true)
    expect(out.length).toBe(104)
  })

  it("only ever emits storage-safe characters", () => {
    const out = safeStorageName("Ünïcödé — «test» / \\ ? % # & ’quote’.docx")
    expect(out).toMatch(/^[A-Za-z0-9._() -]+$/)
    expect(out.endsWith(".docx")).toBe(true)
  })
})
