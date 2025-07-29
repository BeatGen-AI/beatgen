"""
Edit tools for the AI assistant to make precise changes to tracks and projects.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from pydantic_ai import Tool
from app2.types.assistant_actions import AssistantAction, KeySignature


class VolumeEditTool(BaseModel):
    """Tool for adjusting track volume"""
    track_id: str = Field(..., description="The ID of the track to adjust")
    volume: float = Field(..., ge=0.0, le=1.0, description="New volume level between 0.0 (silent) and 1.0 (full volume)")
    
    def execute(self) -> AssistantAction:
        """Execute the volume adjustment"""
        return AssistantAction.adjust_volume(track_id=self.track_id, value=self.volume)


class PanEditTool(BaseModel):
    """Tool for adjusting track panning"""
    track_id: str = Field(..., description="The ID of the track to adjust")
    pan: float = Field(..., ge=-1.0, le=1.0, description="Pan position between -1.0 (full left) and 1.0 (full right)")
    
    def execute(self) -> AssistantAction:
        """Execute the pan adjustment"""
        return AssistantAction.adjust_pan(track_id=self.track_id, value=self.pan)


class MuteEditTool(BaseModel):
    """Tool for muting/unmuting a track"""
    track_id: str = Field(..., description="The ID of the track to mute/unmute")
    muted: bool = Field(..., description="True to mute the track, False to unmute")
    
    def execute(self) -> AssistantAction:
        """Execute the mute toggle"""
        return AssistantAction.toggle_mute(track_id=self.track_id, muted=self.muted)


class SoloEditTool(BaseModel):
    """Tool for soloing/unsoloing a track"""
    track_id: str = Field(..., description="The ID of the track to solo/unsolo")
    soloed: bool = Field(..., description="True to solo the track, False to unsolo")
    
    def execute(self) -> AssistantAction:
        """Execute the solo toggle"""
        return AssistantAction.toggle_solo(track_id=self.track_id, soloed=self.soloed)


class BPMEditTool(BaseModel):
    """Tool for changing project BPM/tempo"""
    bpm: float = Field(..., ge=20.0, le=400.0, description="New BPM value between 20 and 400")
    
    def execute(self) -> AssistantAction:
        """Execute the BPM change"""
        return AssistantAction.change_bpm(value=self.bpm)


class KeyEditTool(BaseModel):
    """Tool for changing project key signature"""
    key: KeySignature = Field(..., description="New key signature for the project")
    
    def execute(self) -> AssistantAction:
        """Execute the key change"""
        return AssistantAction.change_key(value=self.key)


class TimeSignatureEditTool(BaseModel):
    """Tool for changing project time signature"""
    numerator: int = Field(..., gt=0, le=32, description="Time signature numerator (1-32)")
    denominator: int = Field(..., description="Time signature denominator (power of 2)")
    
    def execute(self) -> AssistantAction:
        """Execute the time signature change"""
        return AssistantAction.change_time_signature(numerator=self.numerator, denominator=self.denominator)


class ProjectNameEditTool(BaseModel):
    """Tool for changing project name"""
    name: str = Field(..., min_length=1, max_length=100, description="New project name")
    
    def execute(self) -> AssistantAction:
        """Execute the project name change"""
        return AssistantAction.change_project_name(name=self.name)


# Tool definitions for ChatSession JSON schema format
EDIT_TOOL_SCHEMAS = {
    "adjust_volume": {
        "type": "function",
        "function": {
            "name": "adjust_volume",
            "description": "Adjust the volume level of a specific track",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_id": {
                        "type": "string",
                        "description": "The ID of the track to adjust"
                    },
                    "volume": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 100.0,
                        "description": "New volume level between 0.0 (silent) and 100.0 (full volume)"
                    }
                },
                "required": ["track_id", "volume"]
            }
        }
    },
    "adjust_pan": {
        "type": "function",
        "function": {
            "name": "adjust_pan",
            "description": "Adjust the stereo panning of a specific track",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_id": {
                        "type": "string",
                        "description": "The ID of the track to adjust"
                    },
                    "pan": {
                        "type": "number",
                        "minimum": -1.0,
                        "maximum": 1.0,
                        "description": "Pan position between -1.0 (full left) and 1.0 (full right)"
                    }
                },
                "required": ["track_id", "pan"]
            }
        }
    },
    "toggle_mute": {
        "type": "function",
        "function": {
            "name": "toggle_mute",
            "description": "Mute or unmute a specific track",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_id": {
                        "type": "string",
                        "description": "The ID of the track to mute/unmute"
                    },
                    "muted": {
                        "type": "boolean",
                        "description": "True to mute the track, False to unmute"
                    }
                },
                "required": ["track_id", "muted"]
            }
        }
    },
    "toggle_solo": {
        "type": "function",
        "function": {
            "name": "toggle_solo",
            "description": "Solo or unsolo a specific track",
            "parameters": {
                "type": "object",
                "properties": {
                    "track_id": {
                        "type": "string",
                        "description": "The ID of the track to solo/unsolo"
                    },
                    "soloed": {
                        "type": "boolean",
                        "description": "True to solo the track, False to unsolo"
                    }
                },
                "required": ["track_id", "soloed"]
            }
        }
    },
    "change_bpm": {
        "type": "function",
        "function": {
            "name": "change_bpm",
            "description": "Change the project's BPM (tempo)",
            "parameters": {
                "type": "object",
                "properties": {
                    "bpm": {
                        "type": "number",
                        "minimum": 20.0,
                        "maximum": 400.0,
                        "description": "New BPM value between 20 and 400"
                    }
                },
                "required": ["bpm"]
            }
        }
    },
    "change_key": {
        "type": "function",
        "function": {
            "name": "change_key",
            "description": "Change the project's key signature",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "enum": [
                            "C Major", "G Major", "D Major", "A Major", "E Major", "B Major", 
                            "F# Major", "C# Major", "F Major", "Bb Major", "Eb Major", 
                            "Ab Major", "Db Major", "Gb Major",
                            "A Minor", "E Minor", "B Minor", "F# Minor", "C# Minor", 
                            "G# Minor", "D# Minor", "A# Minor", "D Minor", "G Minor", 
                            "C Minor", "F Minor", "Bb Minor", "Eb Minor"
                        ],
                        "description": "New key signature for the project"
                    }
                },
                "required": ["key"]
            }
        }
    },
    # "change_time_signature": {
    #     "type": "function",
    #     "function": {
    #         "name": "change_time_signature",
    #         "description": "Change the project's time signature",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {
    #                 "numerator": {
    #                     "type": "integer",
    #                     "minimum": 1,
    #                     "maximum": 32,
    #                     "description": "Time signature numerator (1-32)"
    #                 },
    #                 "denominator": {
    #                     "type": "integer",
    #                     "enum": [1, 2, 4, 8, 16, 32],
    #                     "description": "Time signature denominator (power of 2)"
    #                 }
    #             },
    #             "required": ["numerator", "denominator"]
    #         }
    #     }
    # },
    "change_project_name": {
        "type": "function",
        "function": {
            "name": "change_project_name",
            "description": "Change the project's name",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 100,
                        "description": "New project name"
                    }
                },
                "required": ["name"]
            }
        }
    }
}


def create_tool_from_call(tool_name: str, arguments: Dict[str, Any]) -> Optional[BaseModel]:
    """Create a tool instance from a tool call"""
    tool_map = {
        "adjust_volume": VolumeEditTool,
        "adjust_pan": PanEditTool,
        "toggle_mute": MuteEditTool,
        "toggle_solo": SoloEditTool,
        "change_bpm": BPMEditTool,
        "change_key": KeyEditTool,
        # "change_time_signature": TimeSignatureEditTool,
        "change_project_name": ProjectNameEditTool,
    }
    
    tool_class = tool_map.get(tool_name)
    if tool_class:
        return tool_class(**arguments)
    return None


# Pydantic AI Tool Functions
# These are the actual tools that get called by the LLM

# Global variable to store actions for retrieval
_tool_actions = []

def get_tool_actions():
    """Get actions generated by tool calls"""
    return _tool_actions.copy()

def clear_tool_actions():
    """Clear stored actions"""
    _tool_actions.clear()

@Tool
def adjust_volume(track_id: str, volume: float) -> str:
    """Adjust the volume level of a specific track.
    
    Args:
        track_id: The ID of the track to adjust
        volume: New volume level between 0.0 (silent) and 100.0 (full volume)
    """
    if not (0.0 <= volume <= 100.0):
        return f"Error: Volume must be between 0.0 and 100.0, got {volume}"
    
    action = AssistantAction.adjust_volume(track_id=track_id, value=volume)
    _tool_actions.append(action)
    return f"Successfully adjusted volume of track {track_id} to {volume:.1%}"

@Tool  
def adjust_pan(track_id: str, pan: float) -> str:
    """Adjust the stereo panning of a specific track.
    
    Args:
        track_id: The ID of the track to adjust
        pan: Pan position between -1.0 (full left) and 1.0 (full right)
    """
    if not (-1.0 <= pan <= 1.0):
        return f"Error: Pan must be between -1.0 and 1.0, got {pan}"
        
    action = AssistantAction.adjust_pan(track_id=track_id, value=pan)
    _tool_actions.append(action)
    
    pan_desc = "center"
    if pan < -0.1:
        pan_desc = "left"
    elif pan > 0.1:
        pan_desc = "right"
        
    return f"Successfully panned track {track_id} to {pan_desc} ({pan:+.1f})"

@Tool
def toggle_mute(track_id: str, muted: bool) -> str:
    """Mute or unmute a specific track.
    
    Args:
        track_id: The ID of the track to mute/unmute
        muted: True to mute the track, False to unmute
    """
    action = AssistantAction.toggle_mute(track_id=track_id, muted=muted)
    _tool_actions.append(action)
    
    status = "muted" if muted else "unmuted"
    return f"Successfully {status} track {track_id}"

@Tool
def toggle_solo(track_id: str, soloed: bool) -> str:
    """Solo or unsolo a specific track.
    
    Args:
        track_id: The ID of the track to solo/unsolo  
        soloed: True to solo the track, False to unsolo
    """
    action = AssistantAction.toggle_solo(track_id=track_id, soloed=soloed)
    _tool_actions.append(action)
    
    status = "soloed" if soloed else "unsoloed"
    return f"Successfully {status} track {track_id}"

@Tool
def change_bpm(bpm: float) -> str:
    """Change the project's BPM (tempo).
    
    Args:
        bpm: New BPM value between 20 and 400
    """
    if not (20.0 <= bpm <= 400.0):
        return f"Error: BPM must be between 20 and 400, got {bpm}"
        
    action = AssistantAction.change_bpm(value=bpm)
    _tool_actions.append(action)
    return f"Successfully changed project BPM to {bpm}"

@Tool
def change_key(key: str) -> str:
    """Change the project's key signature.
    
    Args:
        key: New key signature (e.g., 'C Major', 'A Minor', 'F# Major')
    """
    try:
        key_enum = KeySignature(key)
        action = AssistantAction.change_key(value=key_enum)  
        _tool_actions.append(action)
        return f"Successfully changed project key to {key}"
    except ValueError:
        return f"Error: Invalid key signature '{key}'. Must be a valid key like 'C Major', 'A Minor', etc."

# @Tool
# def change_time_signature(numerator: int, denominator: int) -> str:
#     """Change the project's time signature.
    
#     Args:
#         numerator: Time signature numerator (1-32)
#         denominator: Time signature denominator (power of 2: 1, 2, 4, 8, 16, 32)
#     """
#     if not (1 <= numerator <= 32):
#         return f"Error: Numerator must be between 1 and 32, got {numerator}"
    
#     if denominator not in [1, 2, 4, 8, 16, 32]:
#         return f"Error: Denominator must be a power of 2 (1, 2, 4, 8, 16, 32), got {denominator}"
        
#     action = AssistantAction.change_time_signature(numerator=numerator, denominator=denominator)
#     _tool_actions.append(action)
#     return f"Successfully changed time signature to {numerator}/{denominator}"

@Tool
def change_project_name(name: str) -> str:
    """Change the project's name.
    
    Args:
        name: New project name (1-100 characters)
    """
    if not name or len(name.strip()) == 0:
        return "Error: Project name cannot be empty"
    
    if len(name) > 100:
        return f"Error: Project name too long ({len(name)} chars). Maximum 100 characters."
        
    action = AssistantAction.change_project_name(name=name.strip())
    _tool_actions.append(action)
    return f"Successfully changed project name to '{name.strip()}'"


# List of all tool functions for easy access
EDIT_TOOLS = [
    adjust_volume,
    adjust_pan, 
    toggle_mute,
    toggle_solo,
    change_bpm,
    change_key,
    # change_time_signature,
    change_project_name
]