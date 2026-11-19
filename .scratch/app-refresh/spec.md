# App refresh (2026-11): up to date, running, working

Status: in-progress

## Goal

Bring BeatGen (FastAPI backend + Vite/React frontend) up to date and get it running and
working end to end, both against a reproducible **local Supabase stack** (Docker) and
against the team's **real dev keys** once they are added as workspace secrets.

Flows that must work end to end:

1. Sign up / log in
2. Projects + studio (create, save, reload a project; add tracks; play audio and MIDI)
3. AI assistant (streaming music assistant generates MIDI/audio)
4. Payments / credits (Stripe subscriptions, webhooks, credits)

## Decisions (from the user, 2026-11-19)

- Scope: **upgrade all dependencies to current versions** (frontend and backend, majors
  included) **and move the AI assistant to current LLM model IDs**.
- Services: **both** a committed local-Supabase dev setup **and** running on real keys.
- Project rules (CLAUDE.md): never edit `frontend/src/platform/types/dto/**` (generated);
  fail loudly, no silent fallbacks; ask instead of assuming.

## Starting state (verified 2026-11-19 at e21c81a)

- Frontend: `npm ci`, `tsc -b`, `vite build` pass. `vitest run`: 156 tests pass, but
  `src/studio/core/export/__tests__/wavEncoder.test.ts` is entirely commented out, so the run
  exits 1 ("No test suite found"). `eslint .`: 979 problems (909 errors, 70 warnings).
- Backend: a fresh `uv pip install -r requirements.txt` succeeds but `import app2.main` fails:
  `requirements.txt` is not fully pinned, a newer `opentelemetry` breaks `pydantic_ai==0.4.8`
  (`ModuleNotFoundError: No module named 'opentelemetry._events'`). `pyproject.toml`/`uv.lock`
  disagree with `requirements.txt` (pyproject lacks fastapi, supabase, stripe, ...).
- Several assistant models are shut down or about to be (OpenAI deprecations page):
  `gpt-3.5-turbo` and `o3-mini` shut down 2026-10-23, `o3` 2026-12-11, `gpt-4o`/`gpt-4.1`
  2027-01-14. Google: `gemini-2.5-pro`/`gemini-2.5-flash` are deprecated and auto-reroute on
  2026-12-01. `gpt-3.5-turbo` is also the backend's implicit default
  (`chat_session_manager.py`: `ALL_MODELS[0]`).

## Contract: assistant model lineup

The frontend sends the **display name** as the wire value (`model` / `chatModel`); the backend
maps it to a provider + model ID and charges `MODEL_COSTS[display name]` credits. Both sides
must use exactly these strings and numbers.

Credits follow the formula implied by every existing entry: `ceil(40 × input $/1M tokens)`
(e.g. old Claude 4 Sonnet $3 → 120, GPT-4.1 $2 → 80, Llama 4 Scout $0.08 → 4).
Prices are list prices as of 2026-11-19 (OpenAI models page, Anthropic pricing, OpenRouter
`/api/v1/models`, which matches Anthropic's list exactly).

| Display name (wire value) | Replaces           | pydantic-ai provider | Model ID                       | Input $/1M | Credits |
|---------------------------|--------------------|----------------------|--------------------------------|-----------:|--------:|
| Gemini 4 Carbon           | Gemini Pro 2.5     | google-gla           | `gemini-4-carbon`              |       2.00 |      80 |
| Gemini 3.8 Flash          | Gemini Flash 2.5   | google-gla           | `gemini-3.8-flash`             |      0.825 |      33 |
| DeepSeek V4 Pro           | Deepseek R1        | openrouter           | `deepseek/deepseek-v4-pro`     |       0.90 |      36 |
| DeepSeek V4.1 Flash       | Deepseek V3        | openrouter           | `deepseek/deepseek-v4.1-flash` |       0.30 |      12 |
| Claude Sonnet 5.5         | Claude 4 Sonnet    | anthropic            | `claude-sonnet-5-5`            |       2.00 |      80 |
| Claude Opus 5.5           | Claude 4 Opus      | anthropic            | `claude-opus-5-5`              |       4.00 |     160 |
| Claude Haiku 5.5          | Claude 3.7 Sonnet  | anthropic            | `claude-haiku-5-5`             |       0.10 |       4 |
| GPT-6.2 Sol               | GPT-4.1            | openai               | `gpt-6.2-sol`                  |       2.00 |      80 |
| GPT-6.1 Terra             | GPT-4o             | openai               | `gpt-6.1-terra`                |       1.00 |      40 |
| GPT-6.2 Astra             | o3                 | openai               | `gpt-6.2-astra`                |       8.00 |     320 |
| GPT-6 Luna                | o3-mini            | openai               | `gpt-6-luna`                   |       0.10 |       4 |
| Llama 4 Maverick          | (same, unchanged)  | openrouter           | `meta-llama/llama-4-maverick`  |       0.35 |      14 |
| Llama 4 Scout             | (same, unchanged)  | openrouter           | `meta-llama/llama-4-scout`     |       0.10 |       4 |

- The list order above is the UI order; the first entry stays the chat window's default.
- `GenerateSongModal` default: `Claude Sonnet 5.5` (was `Claude 4 Sonnet`).
- Removed: `GPT-3.5 Turbo` (backend-only, shut down). A request without a model, or with a
  name not in this table, must fail loudly (no silent default model, no default credit cost).
- Pending user confirmation of the lineup; changing it later is a data-only edit.

## Ownership while child tasks run

- Frontend upgrade child: `frontend/**` (never `frontend/src/platform/types/dto/**`).
- Backend upgrade child: `backend/**` except `backend/scripts/**` and `backend/.env.example`.
- Parent: local Supabase stack (`supabase/**`), `.aether/**`, root `Makefile`, root docs,
  `backend/scripts/**`, `backend/.env.example`, `frontend/.env.example`, integration and
  end-to-end verification.
