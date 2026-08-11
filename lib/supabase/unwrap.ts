// Server pages used to coalesce every query to `(data as X[]) ?? []`, which
// renders a failed query as a page of confident zeros — 0 deals, $0 AUM —
// indistinguishable from real data. Throwing instead lets the route's
// error.tsx boundary show "couldn't load" with a retry, which is the truth.
export function rowsOrThrow<T>(
  res: { data: T[] | null; error: { message: string } | null },
  label: string,
): T[] {
  if (res.error) throw new Error(`Failed to load ${label}: ${res.error.message}`)
  return res.data ?? []
}
