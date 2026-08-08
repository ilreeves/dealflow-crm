# Lint backlog

Reproduce with:

```bash
npx eslint app components lib
```

## Status: 0 errors (cleared 2026-08-08)

All 14 errors captured on 2026-08-04 are fixed. What each one turned out to be, and
the shape of the fix, so the same patterns aren't reintroduced:

### `react-hooks/rules-of-hooks` × 1 — real bug

`CatalystGantt` called `useMemo` *below* its `catalysts.length === 0` early return, so
the hook count changed between an empty and a non-empty board. The memo moved above the
return. **Any hook must sit above every early return in the component.**

### `react-hooks/set-state-in-effect` × 6 — real, all the same two shapes

**Shape A — `setLoading(true)` at the top of a fetch effect** (`NotesList`, `FileManager`,
`settings/page`, `InvestorIntrosTab`). Replaced by deriving `loading` from *which key the
loaded rows belong to*:

```tsx
const [loadedDealId, setLoadedDealId] = useState<string | null>(null)
const loading = loadedDealId !== dealId
```

That removes the extra render pass and is strictly more correct — the old version showed
stale rows as "loaded" for one frame after the id changed. The fetches also picked up a
`cancelled` flag so a slow response for a previous entity can't overwrite the current one.

**Shape B — clearing state synchronously when an input goes away** (`DecksSection` on a
deck with no share token, `GlobalSearch` on close/empty query). Replaced by tagging the
stored data with the key it answers and deriving the empty case at render:

```tsx
const views = loadedViews?.token === deck.token ? loadedViews.rows : []
```

`PipelineBoard` was a third shape: it read `?open=` from `window.location` in a mount
effect. Now `useSearchParams()` feeds the `useState` initializer directly. It stays an
*initial* read — closing the modal clears the query string via `history.replaceState`,
so a live-derived value would fight that.

### `react-hooks/immutability` × 3 — real, mechanical

`useEffect(() => { loadX() }, [dep])` with `loadX` declared *below* the effect. Hoisting
alone only converted them into `set-state-in-effect` errors (the loaders each opened with
`setLoading(true)`), so the fetch bodies were inlined into their effects and `loading`
derived as above.

### `react-hooks/purity` × 3 — two real, one false positive

`CatalystCalendar` read `Date.now()` twice during render to size the overdue / due-soon
windows. In a client component that is a genuine hydration hazard across midnight, so the
clock read moved up into `app/(dashboard)/catalysts/page.tsx` — an async server component
that renders once per request — and arrives as a `today: string` prop. The component now
shifts that string with a pure helper.

`FileManager`'s `Date.now()` was a false positive: it only runs inside an upload handler,
but the compiler can't prove that for a function declared in the component body. Moved to
a module-scope `storagePath()` helper, which is where it belonged anyway.

### `react/no-unescaped-entities` × 1 — cosmetic

`forgot-password` now uses a real `’` rather than a straight quote, matching the rest of
the JSX in this codebase.

## Remaining: 21 warnings, deliberately left

- 14 × `react-hooks/exhaustive-deps` — almost all "missing dependency: `supabase`".
  `createClient()` returns the browser singleton, so adding it changes nothing but the
  rule can't know that. The codebase convention is
  `// eslint-disable-next-line react-hooks/exhaustive-deps` on the deps line.
  **Do NOT bulk-fix these.**
- 7 × `@typescript-eslint/no-unused-vars` — dead imports and placeholder params.

## Rules of engagement

1. `next build` does **not** run ESLint (Next 16), which is how these accumulated
   unnoticed. Run `npx eslint app components lib` explicitly.
2. Run `npx next build` after a batch — the build still type-checks.
3. Never "fix" an error by deleting a suppression that carries a rationale. The worked
   example is the `now` constant in `app/(dashboard)/analytics/page.tsx`, which records
   both why the clock read is safe there and the condition that would make it a bug.
