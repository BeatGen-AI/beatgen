#!/usr/bin/env python3
"""
Seed the LOCAL Supabase stack with instruments (soundfonts) and drum samples.

Refuses to run unless both SUPABASE_URL and DATABASE_URL point at localhost, so it cannot
touch a real project. Safe to re-run: records use deterministic ids and uploads upsert.

Seeds:
  - "Grand Piano" from frontend/public/AI-APiano01trans.SF2 (already shipped in the repo)
  - generated synth soundfonts and drum one-shots (scripts/local_dev_assets.py)

Prerequisites: local stack running (`make supabase-start`) and backend/.env written
(`make local-env`). Tables are created here the same way the backend does on startup.

Usage (from backend/): python scripts/seed_local_dev.py [--skip-if-remote]

--skip-if-remote exits successfully (instead of failing) when SUPABASE_URL is not local,
so `make local-up` can run on every boot even when real project keys are configured.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app2.core.config import settings  # noqa: E402  (loads backend/.env)
from local_dev_assets import SAMPLE_RATE, drum_samples, synth_soundfonts, to_wav  # noqa: E402

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
BUCKET = "assets"
SOUNDFONT_PREFIX = "soundfonts_public"  # see app2/models/enums/storage_type.py
DRUM_PREFIX = "drum_samples_public"
KIT_NAME = "BeatGen Local Kit"
ID_NAMESPACE = uuid.UUID("6f1c7a52-6a43-4c8e-9a39-6b0f3e3b9e10")
PIANO_SF2 = REPO_ROOT / "frontend" / "public" / "AI-APiano01trans.SF2"


def require_local(name: str, url: str) -> None:
    host = urlparse(url).hostname
    if host not in LOCAL_HOSTS:
        sys.exit(f"Refusing to seed: {name} points at {host!r}, not a local stack.")


def stable_id(kind: str, stem: str) -> uuid.UUID:
    return uuid.uuid5(ID_NAMESPACE, f"beatgen-local:{kind}:{stem}")


@dataclass(frozen=True)
class Upload:
    object_path: str
    data: bytes
    content_type: str


def upload_all(uploads: list[Upload]) -> None:
    service_key = settings.supabase.SERVICE_ROLE_KEY
    if not service_key:
        sys.exit("SUPABASE_SECRET_KEY (service role key) is not set; run `make local-env`.")
    headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key, "x-upsert": "true"}
    base = settings.supabase.URL.rstrip("/")
    with httpx.Client(timeout=60) as client:
        for item in uploads:
            response = client.post(
                f"{base}/storage/v1/object/{BUCKET}/{item.object_path}",
                headers={**headers, "Content-Type": item.content_type},
                content=item.data,
            )
            if response.status_code != 200:
                sys.exit(f"Upload of {item.object_path} failed: {response.status_code} {response.text}")
            print(f"uploaded {BUCKET}/{item.object_path} ({len(item.data)} bytes)")


def waveform_peaks(pcm: np.ndarray, points: int = 200) -> list[float]:
    chunks = np.array_split(np.abs(pcm), points)
    return [round(float(chunk.max()), 4) if len(chunk) else 0.0 for chunk in chunks]


async def main(skip_if_remote: bool) -> None:
    if skip_if_remote and urlparse(settings.supabase.URL).hostname not in LOCAL_HOSTS:
        print(f"SUPABASE_URL is not local ({urlparse(settings.supabase.URL).hostname}); skipping local seed.")
        return
    require_local("SUPABASE_URL", settings.supabase.URL)
    require_local("DATABASE_URL", settings.db.URL)
    if not PIANO_SF2.is_file():
        sys.exit(f"Missing {PIANO_SF2}")

    # Imported after the safety checks: importing the DB client connects to DATABASE_URL.
    from app2.infrastructure.database.sqlmodel_client import async_session_factory, create_db_and_tables
    from app2.models.public_models.drum_samples import DrumSamplePublic
    from app2.models.public_models.instrument_file import InstrumentFile
    from app2.types.drum_sample_types import DrumSampleType
    from app2.types.genre_types import GenreType

    uploads: list[Upload] = []
    records: list[object] = []

    soundfonts = [("grand_piano", "Grand Piano", "Piano", "Acoustic piano (repo asset)", PIANO_SF2.read_bytes())]
    soundfonts += [(p.file_stem, p.display_name, p.category, p.description, data) for p, data in synth_soundfonts()]
    for stem, display_name, category, description, data in soundfonts:
        record_id = stable_id("soundfont", stem)
        file_name = f"{stem}.sf2"
        storage_key = f"{category.lower()}/{record_id}/{file_name}"
        uploads.append(Upload(f"{SOUNDFONT_PREFIX}/{storage_key}", data, "application/octet-stream"))
        records.append(InstrumentFile(
            id=record_id, file_name=file_name, display_name=display_name, storage_key=storage_key,
            file_format="sf2", file_size=len(data), category=category, is_public=True,
            description=description, storage_type="PUBLIC_SOUNDFONT",
        ))

    for sample in drum_samples():
        record_id = stable_id("drum", sample.file_stem)
        data = to_wav(sample.pcm)
        file_name = f"{sample.file_stem}.wav"
        storage_key = f"{sample.category}/{record_id}/{file_name}"
        uploads.append(Upload(f"{DRUM_PREFIX}/{storage_key}", data, "audio/wav"))
        records.append(DrumSamplePublic(
            id=record_id, file_name=file_name, display_name=sample.display_name,
            storage_key=storage_key, file_format="wav", file_size=len(data),
            genre=GenreType.ELECTRONIC, category=DrumSampleType(sample.category), kit_name=KIT_NAME,
            duration=round(sample.duration, 4), description=f"{sample.display_name} (generated, {SAMPLE_RATE} Hz)",
            waveform_data=waveform_peaks(sample.pcm), storage_type="PUBLIC_DRUM",
        ))

    await create_db_and_tables()
    upload_all(uploads)
    async with async_session_factory() as session:
        for record in records:
            await session.merge(record)
        await session.commit()
    print(f"seeded {len(soundfonts)} soundfonts and {len(records) - len(soundfonts)} drum samples")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed the local Supabase stack.")
    parser.add_argument("--skip-if-remote", action="store_true",
                        help="exit 0 without seeding when SUPABASE_URL is not local")
    cli_args = parser.parse_args()
    os.chdir(BACKEND_DIR)  # settings load backend/.env relative to the working directory
    asyncio.run(main(cli_args.skip_if_remote))
