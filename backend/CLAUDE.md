# CLAUDE.md - BeatGen Backend

## Run Commands
- `python -m venv venv` - Create virtual environment
- `source venv/bin/activate` - Activate virtual environment (Mac/Linux)
- `venv\Scripts\activate` - Activate virtual environment (Windows)
- `pip install -r requirements.txt` - Install dependencies
- `uvicorn app.main:app --reload` - Run the development server
- `pytest` - Run tests

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