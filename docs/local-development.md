# Local development

BeatGen runs locally against a **local Supabase stack** (auth, storage, Postgres via the
Supabase CLI in Docker) plus **Redis**, or against a real Supabase project if you provide
its keys. Nothing here talks to production unless you configure it to.

## Prerequisites

- Docker (with `docker compose`)
- Node.js 22+ and npm (pnpm also works; both lockfiles are kept in sync)
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- `make`, `openssl`

## First run

```bash
make setup      # npm ci + uv sync, self-signed dev TLS certs, local JWT signing key
make local-up   # start Supabase + Redis, write env files if missing, seed instruments/drums
make run-backend    # https://localhost:8000
make run-frontend   # https://localhost:5173 (self-signed cert: accept it once)
```

`make regen-certs` (needs [mkcert](https://github.com/FiloSottile/mkcert)) replaces the
self-signed certs with ones your browser trusts.

Sign up in the UI with any address on a normal domain, e.g. `you@example.com`. Email
confirmation is off locally. Special-use domains such as `.local` or `.test` are rejected
by the backend's email validation.

## What `make local-up` gives you

| Service | URL | Notes |
|---|---|---|
| Supabase API (auth, storage, REST) | http://127.0.0.1:54321 | Signs JWTs with the ES256 key in `supabase/signing_keys.json` (git-ignored); the backend only accepts asymmetric JWTs. |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres | The backend creates its tables on startup; `supabase/migrations` adds the `storagetype` enum it needs first. |
| Supabase Studio | http://127.0.0.1:54323 | Browse tables and storage. |
| Mailpit | http://127.0.0.1:54324 | Catches auth emails (password reset). |
| Redis | redis://127.0.0.1:6379 | Required by the backend. |

Storage buckets (`supabase/config.toml`): `assets` (public; soundfonts and drum samples),
`tracks` (public; user audio, read via public URLs), `profile-pics` (public).

The seed (`backend/scripts/seed_local_dev.py`, idempotent, refuses non-local targets) adds:

- **Instruments:** Grand Piano (the SF2 already shipped in `frontend/public`), plus generated
  Soft Sine Lead, Warm Saw Pad, Round Bass, Glass Bell (`backend/scripts/local_dev_assets.py`).
- **Drum samples:** a generated "BeatGen Local Kit" (kick, snare, closed/open hat, clap, tom).

These are license-free placeholders, not the production sound library.

## Env files

`make local-env` writes two git-ignored files from `supabase status`, and never
overwrites existing ones (`python3 scripts/local_env.py --force` does):

- `backend/.env`: local Supabase URL and keys, `DATABASE_URL=...?sslmode=disable`.
- `frontend/.env.local`: `VITE_SUPABASE_URL=` (empty, meaning same-origin) and
  `DEV_SUPABASE_PROXY_TARGET`, so the dev server proxies `/storage/v1` to the local stack.

Variables exported in your shell take precedence over both files.

### Using real keys instead

Write `backend/.env` from `backend/.env.example` and `frontend/.env.local` from
`frontend/.env.example`, or export the variables. Use your project's direct or pooler
Postgres URL; SSL is required unless the URL says `sslmode=disable`. Skip `make local-up`,
or run it anyway: it skips seeding when `SUPABASE_URL` isn't local.

## Features that need external keys

These fail loudly without their keys; the local stack doesn't provide them.

- **AI assistant:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and
  `OPENROUTER_API_KEY`, one per provider you want to use. The model lineup is in
  `.scratch/app-refresh/spec.md`.
- **Audio generation:** `FAL_KEY` / `STABILITY_API_KEY` / Google Cloud credentials,
  depending on `AUDIO_GENERATION_PROVIDER`.
- **Payments:** Stripe test-mode keys (`DEV_STRIPE_*` in the backend, `DEV_VITE_STRIPE_*`
  in the frontend). Create plans with `cd backend && uv run python sync_stripe_products.py`.
  Forward webhooks with
  `stripe listen --forward-to https://localhost:8000/webhooks/stripe --skip-verify` and put
  the printed signing secret in `DEV_STRIPE_WEBHOOK_SECRET`.

## Day-to-day

```bash
make local-down       # stop Supabase + Redis (data is kept)
make supabase-reset   # wipe the local DB + storage and re-apply migrations, then:
make seed-local
make supabase-status  # print local URLs and keys
```

## Remote previews (e.g. cloud workspaces)

Preview proxies usually terminate TLS and forward plain HTTP with their own host name:

```bash
DEV_SERVER_HTTPS=false DEV_SERVER_ALLOWED_HOSTS=all make run-frontend
```

API calls go through the dev server's proxy and storage through `/storage/v1`, so only the
frontend port needs to be exposed.
