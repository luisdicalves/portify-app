# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint (Next.js config)

There is no test suite configured. Note that `next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so `npm run build` will succeed even with type/lint errors — don't rely on a successful build as a correctness signal.

## Architecture

Portify ("portfit-app") is a Next.js 14 App Router project that simulates a mobile portfolio-management app. Pages are designed as phone screens, not responsive desktop pages.

**Mobile shell pattern**: nearly every route renders a `.phone-shell` div (defined in `app/globals.css`, `max-width: 430px`, `height: 100dvh`) as its root container. New screens should follow this same wrapper + `BottomNav` pattern rather than introducing a new layout.

**Routing mirrors the screen flow**, not a generic resource hierarchy:
- `app/auth/*` — onboarding/auth flow as a sequence of single-purpose pages (`register`, `pin-set`, `plan-ask`, `plan-set`, `risk`, `objective`, `sectors`, `experience`, `assets`, `summary`, `login`, `pin`)
- `app/dashboard`, `app/portfolio`, `app/activity`, `app/for-you`, `app/profile` — the four main tabs (`BottomNav` in [components/ui/BottomNav.tsx](components/ui/BottomNav.tsx) hardcodes these four paths) plus their drill-down subpages (e.g. `dashboard/net-worth`, `portfolio/[id]`, `portfolio/buy`, `profile/personal`)

**Styling**: no CSS framework — all components use inline `style` objects plus CSS custom properties defined as design tokens in `app/globals.css` `:root` (`--primary`, `--surface*`, `--gain`/`--loss`, `--radius-*`, etc.). Material Symbols font is used for icons via `className="material-symbols-outlined"` (add `icf` class for the filled/active variant).

**Theming & i18n**: [lib/context.tsx](lib/context.tsx) is a single `AppProvider`/`useApp()` context (wraps the app in `app/layout.tsx`) holding `theme` (light/dark, applied via `data-theme` attribute) and `lang` (pt/en), both persisted to `localStorage`. [lib/dict.ts](lib/dict.ts) holds the full PT and EN translation dictionaries as plain objects (`pt`, `en`); `useDict(lang)` returns the active dictionary. All user-facing strings should go through this dictionary rather than being hardcoded in components — PT is the primary/default language.

**Supabase**: [lib/supabase/client.ts](lib/supabase/client.ts) (browser, `createBrowserClient`) and [lib/supabase/server.ts](lib/supabase/server.ts) (server components, `createServerClient` with cookie-based session) are separate factories — use the one matching the component type (`'use client'` vs server component). Schema lives in [supabase-schema.sql](supabase-schema.sql) (run manually in the Supabase SQL editor): `profiles` (auto-created via `handle_new_user` trigger on `auth.users` insert, populated from `signUp` metadata), `holdings`, `transactions`, `investment_plans` — all with RLS policies scoped to `auth.uid()`. Most pages currently use hardcoded mock data rather than querying these tables.

**Deployment**: Vercel ([vercel.json](vercel.json)), requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars (see [.env.local.example](.env.local.example)). See [DEPLOY.md](DEPLOY.md) for the full setup walkthrough.
