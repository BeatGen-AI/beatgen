# CLAUDE.md - BeatGen Backend

## Run Commands
Run from `backend/`. Dependencies are declared in `pyproject.toml` and locked in `uv.lock`;
`requirements.txt` is generated from the lock (see its header) - never edit it by hand.
- `uv sync` - Create `.venv` and install runtime + dev dependencies from the lock
- `uv pip install -r requirements.txt` - Alternative install of the pinned runtime dependencies
- `uv add <pkg>` / edit `pyproject.toml` then `uv lock` - Change dependencies, then regenerate `requirements.txt` with
  `uv export --format requirements.txt --no-hashes --no-dev --no-emit-project --locked -o requirements.txt`
- `uv run uvicorn app2.main:app --reload` - Run the development server (needs `DATABASE_URL`; add `?sslmode=disable` for a local Postgres)
- `uv run pytest` - Run tests

## Database Schema
- **users** (public.users)
  - id uuid (primary key, same as auth.users.id)
  - email text (unique)
  - username text (unique)
  - display_name text
  - avatar_url text
  - created_at timestamp
  - updated_at timestamp

- **project**
  - id uuid (primary key)
  - user_id uuid (references users.id)
  - name text
  - bpm float
  - time_signature_numerator int
  - time_signature_denominator int
  - tracks jsonb
  - created_at timestamp
  - updated_at timestamp

- **audio_track**
  - id uuid (primary key)
  - user_id uuid (references users.id)
  - name text
  - file_format text
  - duration float
  - file_size int
  - sample_rate int
  - waveform_data jsonb
  - created_at timestamp
  - updated_at timestamp
  - storage_key text

- **midi_track**
  - id uuid (primary key)
  - project_id uuid (references project.id)
  - user_id uuid (references users.id)
  - name text
  - bpm float
  - created_at timestamp
  - updated_at timestamp
  - storage_key text

## API Endpoints
- `/api/auth/signup` - Register a new user
- `/api/auth/login` - Authenticate user
- `/api/auth/forgot-password` - Send password reset email
- `/api/users/me` - Get/update current user profile
- `/api/users/me/avatar` - Upload user avatar
- `/api/users/me/password` - Change password
- `/api/projects` - List/create projects
- `/api/projects/{id}` - Get/update/delete project
- `/api/projects/{id}/tracks` - Manage project tracks

## Important Notes
- Table name is "project" (singular) in the database, not "projects"
- Users table uses native Supabase auth: public.users.id = auth.users.id
- JSON schema for tracks is stored in the tracks field
- Row Level Security is enabled on tables
- Authentication uses native Supabase identity linking for multi-provider support