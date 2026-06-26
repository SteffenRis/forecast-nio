# Architecture — FundFrame Forecasting

A calculation-heavy PE/VC **Fund-of-Funds liquidity-forecasting** prototype. This
document is the load-bearing rule for the app. Read it before adding a feature.

---

## The one law: **zustand is the database**

> There is no backend, no server, no `fetch`, no API layer. Everything the app
> knows lives in **one zustand store**, persisted to `localStorage`, and is
> movable as a single JSON file. Every number the user sees that *isn't* something
> they typed is **derived on the fly by a pure function** — never stored.

This is a deliberate choice optimized for speed-to-market on a client prototype.
The whole forecast is reproducible from a small set of typed inputs, so we keep
only the inputs and recompute the rest.

---

## Five conventions (enforced in review)

1. **The store holds raw INPUTS only.** Templates, funds, portfolios, settings, and
   UI flags. Never store a computed PIC curve, a fee bridge, an IRR, a portfolio
   aggregate, or a KID row. *If a number can be derived, it is not in the store.*

2. **All derived numbers come from `src/engine/`** — pure, framework-free functions —
   reached through **memoized selectors** in `src/store/selectors/`. A component
   never calls the engine directly and never recomputes in `render`.

3. **No fetching, ever** — with one carve-out. No `react-query`, `swr`, `axios`, or
   `useEffect(fetch)` for app data; the absence of a network layer is a feature, so
   reject any PR that adds one. **The single allowed exception** is the frankfurter.dev
   exchange-rate integration (`src/lib/fx/frankfurter.ts`): it pulls *external reference
   data*, fires only from an explicit user click (never in render / `useEffect` / on
   load), and writes results to the store as raw inputs (`PulledRate`). The engine still
   imports nothing and makes no network call. Any other `fetch` is still forbidden.

4. **Persistence is automatic; portability is explicit.**
   - `localStorage` (via zustand `persist`) is the **autosave**.
   - Whole-state **JSON export/import** is the **document** ("save file" / "open
     file") — how a client carries a scenario between machines or shares it.

5. **The engine is referentially transparent.** Same inputs → same outputs. No
   `Date.now()`, no randomness, no I/O, no input mutation. This is what makes
   memoization correct and lets the calculation spec's invariants (`CALCULATIONS.md`
   §15) port directly into the test suite.

---

## Data flow — one direction only

```
form edit
   │ (slice action mutates a raw input, immutably)
   ▼
zustand store  ──►  memoized selector  ──►  src/engine pure fn  ──►  derived result
   │                                                                      │
   └──────────────────────────── component re-renders ◄──────────────────┘
```

Dependency direction is strictly **`components → store → engine`**. The engine
imports *nothing* from the store or React. The store imports *from* the engine
(in selectors), never the reverse. The store's persisted entity shapes and the
engine's input types are allowed to diverge — selectors bridge them.

---

## Layout

```
src/
  engine/        PURE calculation engine (CALCULATIONS.md §0–§17). No React, no store.
                 Public surface is JSON-serializable (ISO date strings in, plain objects out)
                 so it is Web-Worker-ready. Tested against the spec's worked numbers + §15 invariants.
  store/
    index.ts       one create() composing slices + immer + persist
    types.ts       Template, Fund, Portfolio, Settings, UiState (the raw inputs)
    slices/        templates · funds · portfolios · settings · ui  (id-keyed entities + order[] + CRUD)
    persistence.ts exportJson / importJson  (the document layer)
    selectors/     narrow read selectors; forecast.ts = the memoized engine-backed selectors
  app/           router + AppShell (the design-system chrome)
  routes/        one page per route: templates · portfolios · funds · settings
  components/     ui/ (shadcn) · shell/ · common/
  lib/           cn, id, download helpers
```

---

## Performance posture

The engine is heavy (≈40 quarters × N scenarios × N funds, plus Brent's-method
XIRR). We **start on the main thread with hierarchical memoization** keyed by input
identity (immer guarantees an input object's reference changes iff a relevant field
changed). Editing one fund invalidates that fund and the portfolios containing it,
not other funds; editing only FX reuses every per-fund forecast.

The engine's public surface is kept **serializable** so a Web Worker can be dropped
in later with no engine or selector rewrites. Flip to a worker only if slider-drag
drops below ~50fps with realistic data (mitigate first with debounced slider commits
+ `useDeferredValue`). Rolling/J-curve IRR is the dominant cost and stays behind an
opt-in flag; terminal IRR is the default headline.

---

## Prototype trade-offs (deliberate, not bugs)

- **No `persist` migrations.** On a schema-version bump we reset to a seeded default
  rather than hand-write migrations. The JSON export is the escape hatch. (`store/persistence.ts`)
- **Shallow import validation.** We trust the JSON document's shape for now.
- Rough UI edges are acceptable; the **input-only store discipline, engine purity,
  the one-directional dependency, and the §15/§16 test suite are not** — they are the
  whole point and expensive to retrofit.

See `CALCULATIONS.md` for the full math specification and `MEMORY`/plan for scope.
