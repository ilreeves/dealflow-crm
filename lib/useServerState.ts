"use client"

import { useState, type Dispatch, type SetStateAction } from "react"

/**
 * State seeded from a server component prop that local edits may overlay, and
 * that RESETS whenever the server sends a new value.
 *
 * The bug this exists to prevent: `useState(serverProp)` captures the prop on
 * first render and ignores every later one. A `router.refresh()` then re-runs
 * the server component, produces correct fresh data, hands it down — and the
 * page shows the copy it snapshotted at mount. It looks like the refresh did
 * nothing. On Runway a cleared flag kept its badge until a full reload; on
 * Revenue a period entered in the modal never appeared in the table.
 *
 * The reset happens DURING render rather than in an effect. That is React's
 * documented pattern for adjusting state when a prop changes, and it is the
 * cheap one: React re-runs this component immediately, before rendering
 * children or touching the DOM, so there is no second commit and no wasted
 * child render. The steady-state cost is one referential `!==` per render.
 *
 * Only reach for this where local edits genuinely need to land before the
 * server round-trips. If nothing mutates the value locally, just read the prop —
 * state with no setter can do only one thing, which is go stale.
 */
export function useServerState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(serverValue)
  const [seen, setSeen] = useState(serverValue)
  // Referential, not deep: a server render always produces a new array, and a
  // deep compare would cost more than the re-render it saved.
  if (serverValue !== seen) {
    setSeen(serverValue)
    setValue(serverValue)
  }
  return [value, setValue]
}
