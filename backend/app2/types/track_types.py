from enum import Enum


class TrackType(str, Enum):
    """Enum for track types"""

    MIDI = "MIDI"
    AUDIO = "AUDIO"
    SAMPLER = "SAMPLER"
    DRUM = "DRUM"
