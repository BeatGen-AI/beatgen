import pytest
from typing import List
from pydantic import BaseModel

from app2.llm.music_gen_service.midi import (
    convert_interval_melody_to_absolute_melody,
    duration_str_to_beats,
)
from app2.llm.music_gen_service.llm_schemas import MelodyData, Note, Bar as AbsoluteBar
from app2.llm.music_gen_service.music_utils import get_key_root_midi # Used for test validation logic

# Helper Pydantic models for structuring test inputs for IntervalMelodyOutput
# These mirror the expected structure used by convert_interval_melody_to_absolute_melody
class IntervalNoteModel(BaseModel):
    interval: str
    duration: str  # e.g., "quarter", "half"
    velocity: float = 0.8

class IntervalBarModel(BaseModel):
    bar_number: int
    notes: List[IntervalNoteModel]

class IntervalMelodyOutputModel(BaseModel):
    starting_octave: int
    bars: List[IntervalBarModel]

# Tests for convert_interval_melody_to_absolute_melody

def test_convert_single_note():
    # C4 midi is 60. Interval "0" from root C4. Duration "quarter" -> 1.0 beat.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=4,
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[IntervalNoteModel(interval="0", duration="quarter", velocity=0.7)]
            )
        ]
    )
    key_name = "C"
    mode_name = "major"
    
    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[Note(pitch=get_key_root_midi(key_name, 4) + 0, start_beat=0.0, duration_beats=1.0, velocity=0.7)]
            )
        ]
    )
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data

def test_convert_rest_then_note():
    # C4 midi is 60. Rest for 1 beat, then D4 (60+2) for 2 beats.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=4,
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[
                    IntervalNoteModel(interval="R", duration="quarter", velocity=0.0), # Rest
                    IntervalNoteModel(interval="+2", duration="half", velocity=0.9)    # D4
                ]
            )
        ]
    )
    key_name = "C"
    mode_name = "major"
    
    # The first note is a rest, so current_beat_in_bar advances.
    # The next note (+2) should be relative to initial_midi_note_for_bar_start (C4=60).
    # So, pitch = 60 + 2 = 62. Start beat = 1.0 (after quarter rest). Duration = 2.0 (half note).
    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[Note(pitch=get_key_root_midi(key_name, 4) + 2, start_beat=1.0, duration_beats=2.0, velocity=0.9)]
            )
        ]
    )
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data

def test_convert_multiple_notes_relative_intervals():
    # C4=60.
    # Note 1: C4 (60+0), duration 1.0. current_midi_note becomes 60.
    # Note 2: D4 (60+2), duration 2.0. current_midi_note becomes 62.
    # Note 3: B3 (62-3), duration 1.0. current_midi_note becomes 59.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=4,
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[
                    IntervalNoteModel(interval="0", duration="quarter", velocity=0.8),    # C4
                    IntervalNoteModel(interval="+2", duration="half", velocity=0.9),      # D4 relative to C4
                    IntervalNoteModel(interval="-3", duration="quarter", velocity=0.7) # B3 relative to D4
                ]
            )
        ]
    )
    key_name = "C"
    mode_name = "major"
    
    root_midi = get_key_root_midi(key_name, 4) # 60
    
    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[
                    Note(pitch=root_midi + 0, start_beat=0.0, duration_beats=1.0, velocity=0.8),
                    Note(pitch=(root_midi + 0) + 2, start_beat=1.0, duration_beats=2.0, velocity=0.9),
                    Note(pitch=((root_midi + 0) + 2) - 3, start_beat=3.0, duration_beats=1.0, velocity=0.7),
                ]
            )
        ]
    )
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data

def test_convert_first_note_establishes_pitch():
    # A G#2 (octave 2) will be get_key_root_midi("G#", 2) = 44
    # First note interval +3 from root.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=2, # G#2
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[IntervalNoteModel(interval="+3", duration="whole", velocity=0.75)] # Should be 44+3 = 47
            )
        ]
    )
    key_name = "G#" 
    mode_name = "major" # Does not affect root MIDI for this test directly, but good to specify

    expected_pitch = get_key_root_midi(key_name, 2) + 3
    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[Note(pitch=expected_pitch, start_beat=0.0, duration_beats=4.0, velocity=0.75)]
            )
        ]
    )
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data


def test_convert_empty_melody():
    interval_melody = IntervalMelodyOutputModel(starting_octave=4, bars=[])
    key_name = "C"
    mode_name = "major"
    
    expected_melody_data = MelodyData(bars=[])
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data

def test_convert_bar_with_no_notes():
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=4,
        bars=[IntervalBarModel(bar_number=1, notes=[])]
    )
    key_name = "C"
    mode_name = "major"
    
    expected_melody_data = MelodyData(bars=[]) # Bar is not added if it has no absolute notes
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data

def test_convert_invalid_interval_holds_pitch(caplog):
    # C4=60
    # Note 1: C4 (60+0). current_midi_note = 60.
    # Note 2: Invalid "XYZ", should hold pitch 60. current_midi_note = 60.
    # Note 3: C#4 (60+1). current_midi_note = 61.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=4,
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[
                    IntervalNoteModel(interval="0", duration="quarter", velocity=0.8),
                    IntervalNoteModel(interval="XYZ", duration="quarter", velocity=0.8), # Invalid
                    IntervalNoteModel(interval="+1", duration="quarter", velocity=0.8)  # Relative to previous (held) 60
                ]
            )
        ]
    )
    key_name = "C"
    mode_name = "major"
    root_midi = get_key_root_midi(key_name, 4) # 60

    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[
                    Note(pitch=root_midi, start_beat=0.0, duration_beats=1.0, velocity=0.8),
                    Note(pitch=root_midi, start_beat=1.0, duration_beats=1.0, velocity=0.8), # Held pitch
                    Note(pitch=root_midi + 1, start_beat=2.0, duration_beats=1.0, velocity=0.8)  # Relative to held pitch
                ]
            )
        ]
    )
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data
    assert "Warning: Could not parse interval 'XYZ'" in caplog.text


def test_convert_pitch_clamping():
    # C0 = 12.
    # Note 1: C0 (12+0). pitch=12. current_midi_note=12.
    # Note 2: Interval -20. 12-20 = -8. Clamped to 0. pitch=0. current_midi_note=0.
    # Note 3: Interval +150 from 0. 0+150 = 150. Clamped to 127. pitch=127. current_midi_note=127.
    interval_melody = IntervalMelodyOutputModel(
        starting_octave=0, # C0 = 12
        bars=[
            IntervalBarModel(
                bar_number=1,
                notes=[
                    IntervalNoteModel(interval="0", duration="quarter", velocity=0.8),     # Pitch 12
                    IntervalNoteModel(interval="-20", duration="quarter", velocity=0.8),   # Try to go to -8, clamped to 0
                    IntervalNoteModel(interval="+150", duration="quarter", velocity=0.8) # Try to go to 0+150=150, clamped to 127
                ]
            )
        ]
    )
    key_name = "C" # C0
    mode_name = "major"
    
    root_midi = get_key_root_midi(key_name, 0) # 12
    
    expected_melody_data = MelodyData(
        bars=[
            AbsoluteBar(
                bar=1,
                notes=[
                    Note(pitch=root_midi, start_beat=0.0, duration_beats=1.0, velocity=0.8), #12
                    Note(pitch=0, start_beat=1.0, duration_beats=1.0, velocity=0.8),        #0
                    Note(pitch=127, start_beat=2.0, duration_beats=1.0, velocity=0.8)     #127
                ]
            )
        ]
    )
    
    result = convert_interval_melody_to_absolute_melody(interval_melody, key_name, mode_name)
    assert result == expected_melody_data 

# Tests for duration_str_to_beats

@pytest.mark.parametrize("duration_str, tempo, expected_beats", [
    ("whole", 120, 4.0),
    ("half", 120, 2.0),
    ("dotted half", 120, 3.0),
    ("quarter", 120, 1.0),
    ("dotted quarter", 120, 1.5),
    ("eighth", 120, 0.5),
    ("dotted eighth", 120, 0.75),
    ("sixteenth", 120, 0.25),
    ("thirtysecond", 120, 0.125),
    ("quarter triplet", 120, 2.0 / 3.0),
    ("eighth triplet", 120, 1.0 / 3.0),
    ("sixteenth triplet", 120, 0.5 / 3.0),
    ("quarter-triplet", 60, 2.0 / 3.0), # Test hyphen and tempo (tempo is ignored)
])
def test_duration_str_to_beats_valid_durations(duration_str, tempo, expected_beats):
    assert duration_str_to_beats(duration_str, tempo) == pytest.approx(expected_beats)

def test_duration_str_to_beats_invalid_duration():
    # Default to 1.0 beat for unknown strings
    assert duration_str_to_beats("unknown_duration", 120) == 1.0

def test_duration_str_to_beats_tempo_ignored():
    # The implementation of duration_str_to_beats does not use the tempo parameter.
    assert duration_str_to_beats("quarter", 60) == 1.0
    assert duration_str_to_beats("quarter", 120) == 1.0
    assert duration_str_to_beats("quarter", 240) == 1.0 