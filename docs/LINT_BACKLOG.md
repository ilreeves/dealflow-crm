# Lint backlog — errors to triage

Captured 2026-08-04, end of the revenue-tracking work. **None of these block `next build`**
(Next 16 does not run ESLint during build) and **none were introduced by that work** —
they are all pre-existing. Reproduce with:

```bash
npx eslint app components lib
```

## Errors, worst first

### `react-hooks/rules-of-hooks` — 1 × · **LIKELY REAL BUG**

A hook called conditionally or outside a component. Breaks React's hook ordering — can crash, or silently bind state to the wrong render.

- `components/catalysts/CatalystGantt.tsx:160` — React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render.

### `react-hooks/set-state-in-effect` — 6 × · **LIKELY REAL BUG**

setState inside useEffect without a guard forces an extra render pass and can loop. Often a sign the value should be derived during render instead of stored.

- `app/deck/[token]/DeckGate.tsx:27` — Error: Calling setState synchronously within an effect can trigger cascading renders
- `components/GlobalSearch.tsx:43` — Error: Calling setState synchronously within an effect can trigger cascading renders
- `components/GlobalSearch.tsx:48` — Error: Calling setState synchronously within an effect can trigger cascading renders
- `components/pipeline/PipelineBoard.tsx:44` — Error: Calling setState synchronously within an effect can trigger cascading renders
- `components/shared/DecksSection.tsx:193` — Error: Calling setState synchronously within an effect can trigger cascading renders
- `components/shared/InvestorIntrosTab.tsx:33` — Error: Calling setState synchronously within an effect can trigger cascading renders

### `react-hooks/immutability` — 3 × · **PROBABLY REAL**

Mutating a value React owns. Mutations React cannot see do not trigger a re-render, so the UI silently goes stale.

- `app/(dashboard)/settings/page.tsx:43` — Error: Cannot access variable before it is declared
- `components/deals/FileManager.tsx:33` — Error: Cannot access variable before it is declared
- `components/deals/NotesList.tsx:23` — Error: Cannot access variable before it is declared

### `react-hooks/purity` — 3 × · **CHECK CONTEXT FIRST**

Impure call during render (clock, random). BENIGN in an async server component that renders once per request; a real hydration/staleness bug in a client component.

- `components/catalysts/CatalystCalendar.tsx:164` — Error: Cannot call impure function during render
- `components/catalysts/CatalystCalendar.tsx:166` — Error: Cannot call impure function during render
- `components/deals/FileManager.tsx:59` — Error: Cannot call impure function during render

### `react/no-unescaped-entities` — 1 × · **COSMETIC**

Raw apostrophe or quote in JSX text. No runtime effect.

- `app/forgot-password/page.tsx:41` — `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`.

## Warnings (lower priority)

- 20 × `react-hooks/exhaustive-deps`
- 7 × `@typescript-eslint/no-unused-vars`

## How to approach it

1. Start with `rules-of-hooks` and `set-state-in-effect` — the two most likely to be real defects rather than style.
2. For each `purity` hit, check FIRST whether the file is a server component. An async server component that reads
   cookies renders once per request and never hydrates, so a clock read there is safe and wants a *documented
   suppression*, not a code change. Worked example: the `now` constant in `app/(dashboard)/analytics/page.tsx`,
   which records both why it is safe and the condition that would make it a genuine bug.
3. Fix one rule at a time and run `npx next build` after each — the build type-checks even though it does not lint.
4. Do NOT bulk-fix `exhaustive-deps`. Several are deliberate in this codebase and already carry a disable comment.

⚠️ Never 'fix' one of these by deleting a suppression that carries a rationale — the reasoning is the point.
