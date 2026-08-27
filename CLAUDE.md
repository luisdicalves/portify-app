# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint (Next.js config)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run the Vitest unit/integration suite
- `npm run test:e2e` — run the Playwright e2e suite
- `npm run check` — typecheck + lint + test, in that order (the full local CI-equivalent gate)

There is a real test suite (Vitest, ~23 files at last count) and `next.config.js` does **not** set `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds` — a successful `npm run build` and a clean `npm run check` are meaningful correctness signals. (This corrects an earlier version of this file that claimed otherwise — verify claims like this against the actual repo state before trusting them, this file has drifted from reality before.)

## Canonical product/decision source

Product requirements, financial-model specifications, governance decisions and business-model decisions for Portify are **not** tracked in this repository — they live in a separate, sibling repository: `~/Documents/PORTIFY-KNOWLEDGE` (or `github.com/luisdicalves/PORTIFY-KNOWLEDGE`). This repo (`portfit-app`) is the chosen engineering implementation (`11-engineering/CLAUDE-ARCHITECTURE/ADR/ADR-001` in that repo), but is deliberately a separate git history/lifecycle from the knowledge base — see that repo's `START-HERE.md` for the reading order, and its `11-engineering/README.md` for the engineering-handoff area specifically. When implementing a feature here, check whether a Screen Specification Pack or model spec already exists there before inventing UI/business behavior.

## Architecture

Portify ("portfit-app") is a Next.js 14 App Router project that simulates a mobile portfolio-management app. Pages are designed as phone screens, not responsive desktop pages.

**Mobile shell pattern**: nearly every route renders a `.phone-shell` div (defined in `app/globals.css`, `max-width: 430px`, `height: 100dvh`) as its root container. New screens should follow this same wrapper + `BottomNav` pattern rather than introducing a new layout.

**Routing mirrors the screen flow**, not a generic resource hierarchy:
- `app/auth/*` — onboarding/auth flow as a sequence of single-purpose pages (`register`, `login`, `pin-set`, `pin`, `onboarding`, `plan-ask`, `plan-set`, `risk`, `reaction`, `objective`, `sectors`, `experience`, `liquidity`, `financial`, `summary`). There is no `app/auth/assets` — it was removed; session'd users with no plan are redirected to `/auth/experience` instead.
- `app/dashboard`, `app/portfolio`, `app/for-you`, `app/profile` — the four main tabs (`BottomNav` in [components/ui/BottomNav.tsx](components/ui/BottomNav.tsx) hardcodes these four paths — there is no `app/activity`) plus their drill-down subpages (`dashboard/net-worth`, `dashboard/performance`, `portfolio/[id]`, `portfolio/add`, `profile/personal`, `profile/security`, `profile/settings`)

**Styling**: no CSS framework — all components use inline `style` objects plus CSS custom properties defined as design tokens in `app/globals.css` `:root` (`--primary`, `--surface*`, `--gain`/`--loss`, `--radius-*`, etc.). Material Symbols font is used for icons via `className="material-symbols-outlined"` (add `icf` class for the filled/active variant).

**Theming & i18n**: [lib/context.tsx](lib/context.tsx) is a single `AppProvider`/`useApp()` context (wraps the app in `app/layout.tsx`) holding `theme` (light/dark, applied via `data-theme` attribute) and `lang` (pt/en), both persisted to `localStorage`. [lib/dict/index.ts](lib/dict/index.ts) (with [lib/dict/pt.ts](lib/dict/pt.ts) and [lib/dict/en.ts](lib/dict/en.ts)) holds the full PT and EN translation dictionaries as plain objects (`pt`, `en`); `useDict(lang)` returns the active dictionary. All user-facing strings should go through this dictionary rather than being hardcoded in components — PT is the primary/default language.

**Supabase**: [lib/supabase/client.ts](lib/supabase/client.ts) (browser, `createBrowserClient`) and [lib/supabase/server.ts](lib/supabase/server.ts) (server components, `createServerClient` with cookie-based session) are separate factories — use the one matching the component type (`'use client'` vs server component). Schema lives in [supabase-schema.sql](supabase-schema.sql) (run manually in the Supabase SQL editor): `profiles` (auto-created via `handle_new_user` trigger on `auth.users` insert, populated from `signUp` metadata), `holdings`, `import_audit_logs`, `transactions`, `investment_plans` — all with RLS policies scoped to `auth.uid()`. There is a live production project (see `docs/supabase-environments.md` for the local/staging/production split and `SUPABASE_ENVIRONMENT` convention) — Dashboard, Portfolio and the recommendation engine read real holdings/transactions via [lib/portfolio/portfolioState.ts](lib/portfolio/portfolioState.ts), not mock data; check a specific page's data-fetching before assuming it's still a mock.

**Deployment**: Vercel ([vercel.json](vercel.json)), requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars (see [.env.local.example](.env.local.example)). See [DEPLOY.md](DEPLOY.md) for the full setup walkthrough.
