"""
Procedurally generated, license-free audio assets for the LOCAL development stack.

- `synth_soundfonts()` builds small single-preset SoundFont 2 (.sf2) files. The studio plays
  the first preset of each soundfont (frontend MidiChannelPlayer), so one preset per file.
- `drum_samples()` synthesizes one-shot drum WAVs.

These exist so a fresh local Supabase can be seeded without downloading third-party
assets. They are intentionally simple; production assets live in the real Supabase project.
"""

from __future__ import annotations

import io
import math
import struct
import wave
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 44100


# --------------------------------------------------------------------------------------
# SoundFont 2 writer (RIFF "sfbk"), per the SoundFont 2.04 specification.
# --------------------------------------------------------------------------------------

# Generator operators used below (SF2 spec section 8.1.2).
GEN_ATTACK_VOL_ENV = 34
GEN_HOLD_VOL_ENV = 35
GEN_DECAY_VOL_ENV = 36
GEN_SUSTAIN_VOL_ENV = 37
GEN_RELEASE_VOL_ENV = 38
GEN_INSTRUMENT = 41
GEN_KEY_RANGE = 43
GEN_SAMPLE_ID = 53
GEN_SAMPLE_MODES = 54
GEN_OVERRIDING_ROOT_KEY = 58

SAMPLE_TYPE_MONO = 1
SF2_SAMPLE_PADDING = 46  # The spec requires >= 46 zero sample points after each sample.
LOOP_GUARD = 32  # Samples kept on each side of loop markers (spec minimum is 8).


def _chunk(chunk_id: bytes, data: bytes) -> bytes:
    if len(data) % 2:
        data += b"\0"
    return chunk_id + struct.pack("<I", len(data)) + data


def _list(list_type: bytes, *chunks: bytes) -> bytes:
    return _chunk(b"LIST", list_type + b"".join(chunks))


def _name20(name: str) -> bytes:
    encoded = name.encode("ascii")
    if len(encoded) > 19:
        raise ValueError(f"SF2 names are limited to 19 ASCII characters: {name!r}")
    return encoded.ljust(20, b"\0")


def _zstr(text: str) -> bytes:
    data = text.encode("ascii") + b"\0"
    return data + (b"\0" if len(data) % 2 else b"")


def _timecents(seconds: float) -> int:
    return int(round(1200 * math.log2(seconds)))


def _gen(oper: int, amount: int) -> bytes:
    return struct.pack("<Hh", oper, amount)


def _gen_range(oper: int, low: int, high: int) -> bytes:
    return struct.pack("<HBB", oper, low, high)


@dataclass(frozen=True)
class SynthPatch:
    """One single-preset soundfont."""

    file_stem: str
    display_name: str
    category: str
    description: str
    pcm: np.ndarray  # float32 in [-1, 1]
    root_key: int
    loop: tuple[int, int] | None  # (start, end) sample indices, end exclusive
    attack_s: float
    decay_s: float
    sustain_cb: int  # sustain attenuation in centibels (0 = full level)
    release_s: float


def build_sf2(patch: SynthPatch) -> bytes:
    pcm16 = np.clip(np.round(patch.pcm * 32767), -32768, 32767).astype("<i2")
    smpl = pcm16.tobytes() + b"\0\0" * SF2_SAMPLE_PADDING
    n = len(pcm16)
    # Unlooped samples still need in-bounds loop markers (ignored with sampleModes=0).
    loop_start, loop_end = patch.loop if patch.loop else (LOOP_GUARD, n - LOOP_GUARD)

    info = _list(
        b"INFO",
        _chunk(b"ifil", struct.pack("<HH", 2, 4)),
        _chunk(b"isng", _zstr("EMU8000")),
        _chunk(b"INAM", _zstr(patch.display_name)),
        _chunk(b"ICMT", _zstr("Generated for BeatGen local development (license-free).")),
    )
    sdta = _list(b"sdta", _chunk(b"smpl", smpl))

    phdr = (
        _name20(patch.display_name) + struct.pack("<HHHIII", 0, 0, 0, 0, 0, 0)
        + _name20("EOP") + struct.pack("<HHHIII", 0, 0, 1, 0, 0, 0)
    )
    pbag = struct.pack("<HH", 0, 0) + struct.pack("<HH", 1, 0)
    pmod = b"\0" * 10
    pgen = _gen(GEN_INSTRUMENT, 0) + b"\0" * 4

    igens = [
        _gen_range(GEN_KEY_RANGE, 0, 127),  # keyRange must come first
        _gen(GEN_ATTACK_VOL_ENV, _timecents(patch.attack_s)),
        _gen(GEN_HOLD_VOL_ENV, _timecents(0.001)),
        _gen(GEN_DECAY_VOL_ENV, _timecents(patch.decay_s)),
        _gen(GEN_SUSTAIN_VOL_ENV, patch.sustain_cb),
        _gen(GEN_RELEASE_VOL_ENV, _timecents(patch.release_s)),
        _gen(GEN_OVERRIDING_ROOT_KEY, patch.root_key),
        _gen(GEN_SAMPLE_MODES, 1 if patch.loop else 0),
        _gen(GEN_SAMPLE_ID, 0),  # sampleID must come last
    ]
    inst = _name20(patch.display_name) + struct.pack("<H", 0) + _name20("EOI") + struct.pack("<H", 1)
    ibag = struct.pack("<HH", 0, 0) + struct.pack("<HH", len(igens), 0)
    imod = b"\0" * 10
    igen = b"".join(igens) + b"\0" * 4
    shdr = (
        _name20(patch.display_name)
        + struct.pack("<IIIII", 0, n, loop_start, loop_end, SAMPLE_RATE)
        + struct.pack("<BbHH", patch.root_key, 0, 0, SAMPLE_TYPE_MONO)
        + _name20("EOS")
        + struct.pack("<IIIII", 0, 0, 0, 0, 0)
        + struct.pack("<BbHH", 0, 0, 0, 0)
    )
    pdta = _list(
        b"pdta",
        _chunk(b"phdr", phdr),
        _chunk(b"pbag", pbag),
        _chunk(b"pmod", pmod),
        _chunk(b"pgen", pgen),
        _chunk(b"inst", inst),
        _chunk(b"ibag", ibag),
        _chunk(b"imod", imod),
        _chunk(b"igen", igen),
        _chunk(b"shdr", shdr),
    )
    body = b"sfbk" + info + sdta + pdta
    return b"RIFF" + struct.pack("<I", len(body)) + body


def _midi_hz(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def _looped_tone(note: int, harmonics: list[float], periods_in_loop: int, total_s: float):
    """Additive tone whose loop spans whole periods, so it loops without clicks."""
    freq = _midi_hz(note)
    loop_len = int(round(periods_in_loop * SAMPLE_RATE / freq))
    # Retune so the loop holds an exact whole number of periods.
    freq = periods_in_loop * SAMPLE_RATE / loop_len
    n = max(int(total_s * SAMPLE_RATE), loop_len * 2)
    t = np.arange(n) / SAMPLE_RATE
    wave_ = sum(amp * np.sin(2 * np.pi * freq * (i + 1) * t) for i, amp in enumerate(harmonics))
    wave_ = (0.8 * wave_ / np.max(np.abs(wave_))).astype(np.float32)
    loop_end = n - (n % loop_len)
    loop_start = loop_end - loop_len * max(1, (loop_end // loop_len) // 2)
    # The spec wants loop points at least 8 samples inside the sample data. The waveform
    # is periodic over the loop, so continuing it past loop_end is seamless.
    tail = wave_[loop_start:loop_start + LOOP_GUARD]
    return np.concatenate([wave_[:loop_end], tail]), (loop_start, loop_end)


def synth_soundfonts() -> list[tuple[SynthPatch, bytes]]:
    patches: list[SynthPatch] = []

    pcm, loop = _looped_tone(60, [1.0, 0.15, 0.05], periods_in_loop=16, total_s=1.0)
    patches.append(SynthPatch("soft_sine_lead", "Soft Sine Lead", "Synth",
                              "Gentle sine lead (generated)", pcm, 60, loop,
                              attack_s=0.01, decay_s=0.3, sustain_cb=60, release_s=0.25))

    pcm, loop = _looped_tone(60, [1.0 / k for k in range(1, 25)], periods_in_loop=16, total_s=1.0)
    patches.append(SynthPatch("warm_saw_pad", "Warm Saw Pad", "Pad",
                              "Slow-attack saw pad (generated)", pcm, 60, loop,
                              attack_s=0.35, decay_s=1.0, sustain_cb=30, release_s=0.9))

    pcm, loop = _looped_tone(36, [1.0, 0.0, 1 / 9, 0.0, 1 / 25, 0.0, 1 / 49], periods_in_loop=4, total_s=1.0)
    patches.append(SynthPatch("round_bass", "Round Bass", "Bass",
                              "Triangle-style bass (generated)", pcm, 36, loop,
                              attack_s=0.005, decay_s=0.4, sustain_cb=120, release_s=0.12))

    # Non-looping decaying bell with inharmonic partials.
    freq = _midi_hz(72)
    t = np.arange(int(1.6 * SAMPLE_RATE)) / SAMPLE_RATE
    bell = sum(a * np.exp(-t * d) * np.sin(2 * np.pi * freq * r * t)
               for r, a, d in [(1.0, 1.0, 2.5), (2.76, 0.5, 4.0), (5.4, 0.25, 6.0), (8.93, 0.12, 9.0)])
    bell = (0.8 * bell / np.max(np.abs(bell))).astype(np.float32)
    patches.append(SynthPatch("glass_bell", "Glass Bell", "Keys",
                              "Decaying bell (generated)", bell, 72, None,
                              attack_s=0.002, decay_s=1.5, sustain_cb=0, release_s=0.4))

    return [(p, build_sf2(p)) for p in patches]


# --------------------------------------------------------------------------------------
# Drum one-shots
# --------------------------------------------------------------------------------------

@dataclass(frozen=True)
class DrumSample:
    file_stem: str
    display_name: str
    category: str  # DrumSampleType value, e.g. "kick"
    pcm: np.ndarray

    @property
    def duration(self) -> float:
        return len(self.pcm) / SAMPLE_RATE


def to_wav(pcm: np.ndarray) -> bytes:
    pcm16 = np.clip(np.round(pcm * 32767), -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm16.tobytes())
    return buf.getvalue()


def _norm(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    return (peak * x / np.max(np.abs(x))).astype(np.float32)


def _highpass(x: np.ndarray, alpha: float) -> np.ndarray:
    y = np.zeros_like(x)
    for i in range(1, len(x)):
        y[i] = alpha * (y[i - 1] + x[i] - x[i - 1])
    return y


def drum_samples() -> list[DrumSample]:
    rng = np.random.default_rng(1234)  # deterministic output

    def t(seconds: float) -> np.ndarray:
        return np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE

    tk = t(0.5)
    kick_freq = 45 + 110 * np.exp(-tk * 28)
    kick = np.sin(2 * np.pi * np.cumsum(kick_freq) / SAMPLE_RATE) * np.exp(-tk * 7)

    ts = t(0.3)
    snare = 0.6 * rng.standard_normal(len(ts)) * np.exp(-ts * 18) + 0.5 * np.sin(2 * np.pi * 185 * ts) * np.exp(-ts * 25)

    tc = t(0.09)
    closed_hh = _highpass(rng.standard_normal(len(tc)), 0.6) * np.exp(-tc * 60)

    to = t(0.45)
    open_hh = _highpass(rng.standard_normal(len(to)), 0.6) * np.exp(-to * 8)

    tcl = t(0.3)
    clap_env = sum(np.exp(-np.clip(tcl - d, 0, None) * 120) * (tcl >= d) for d in (0.0, 0.012, 0.024)) + 0.6 * np.exp(-np.clip(tcl - 0.036, 0, None) * 14) * (tcl >= 0.036)
    clap = _highpass(rng.standard_normal(len(tcl)), 0.8) * clap_env

    tt = t(0.4)
    tom_freq = 90 + 50 * np.exp(-tt * 15)
    tom = np.sin(2 * np.pi * np.cumsum(tom_freq) / SAMPLE_RATE) * np.exp(-tt * 9)

    return [
        DrumSample("local_kick", "Local Kick", "kick", _norm(kick)),
        DrumSample("local_snare", "Local Snare", "snare", _norm(snare)),
        DrumSample("local_closed_hat", "Local Closed Hat", "closed_hh", _norm(closed_hh, 0.7)),
        DrumSample("local_open_hat", "Local Open Hat", "open_hh", _norm(open_hh, 0.7)),
        DrumSample("local_clap", "Local Clap", "clap", _norm(clap, 0.8)),
        DrumSample("local_tom", "Local Tom", "tom", _norm(tom)),
    ]
