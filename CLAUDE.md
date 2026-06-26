# CLAUDE.md — FundFrame Forecasting

PE/VC Fund-of-Funds liquidity-forecasting prototype. React + Vite + TypeScript SPA.

## The rule (read `ARCHITECTURE.md` for the full version)

**Zustand is the entire database. There is no backend, no fetch, no API.** All
persisted data lives in one zustand store (`src/store/`), and **every derived number
is computed on the fly by pure functions in `src/engine/`** — never stored.

Non-negotiable conventions:

1. **Store holds raw INPUTS only** — never a computed curve, fee, IRR, or aggregate.
2. **Derived numbers come from `src/engine/`** (pure) via **memoized selectors** in
   `src/store/selectors/`. Components never call the engine in render.
3. **No fetching, ever** — no `react-query`/`swr`/`axios`/`useEffect(fetch)`. One
   carve-out: the frankfurter.dev FX pull (`src/lib/fx/frankfurter.ts`) — user-click
   only, external reference data, written to the store as raw inputs. See ARCHITECTURE.md §3.
4. **Persist** to localStorage (autosave) **+ JSON export/import** (the document).
5. **Engine is referentially transparent** — pure, no `Date.now()`/randomness/I/O,
   never mutates inputs, JSON-serializable public surface (Web-Worker-ready).

Dependency direction is strictly **`components → store → engine`**. The engine
imports nothing from the store or React.

## Source of truth for the math

`.context/attachments/UMKxrD/CALCULATIONS.md` (§0–§17) — the complete calculation
spec with worked numbers and the §15 invariants. The engine's test suite
(`src/engine/__tests__/`) is the contract: it must reproduce §16's reference example
and §15's invariants. A client verifies the numbers against Excel.

## Design system

`.context/attachments/v7w3gq/App Shell - Forecasting Navigation.html` — FundFrame
tokens (Geist font, slate palette, `--brand-navy #0a1a4d`, Lucide icons), the fixed
sidebar + topbar shell, and four flat routes: Templates · Portfolios · Funds · Settings.
Tokens live in `src/index.css` `@theme`. UI uses Tailwind v4 + shadcn/ui.

## Commands

- `npm run dev` — dev server
- `npm test` — run the Vitest suite (engine correctness is the headline)
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run typecheck` — types only
