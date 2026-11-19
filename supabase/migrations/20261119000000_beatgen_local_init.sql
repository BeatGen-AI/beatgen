-- BeatGen local development schema prerequisites.
--
-- The backend creates its tables itself on startup (SQLModel create_all in
-- backend/app2/infrastructure/database/sqlmodel_client.py). It does NOT create the
-- `storagetype` enum: the models declare it with `create_type=False`
-- (instrument_files, drum_samples_public, audio_tracks, sampler_tracks), so it must
-- exist before the backend's first start.
create type public.storagetype as enum (
  'USER_AUDIO',
  'USER_SAMPLE',
  'PUBLIC_DRUM',
  'PUBLIC_SOUNDFONT'
);
