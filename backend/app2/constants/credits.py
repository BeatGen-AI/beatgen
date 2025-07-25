"""
Credit system constants for BeatGen
"""

# Credit allocations per subscription tier (10x granular)
CREDIT_ALLOCATIONS = {
    "free": {"monthly": 100, "rollover": False},
    "starter": {"monthly": 500, "rollover": True},
    "creator": {"monthly": 1500, "rollover": True},
    "pro": {"monthly": -1, "rollover": False},  # -1 means unlimited
}

# Credit costs per operation (10x granular)
CREDIT_COSTS = {
    "ai_music_generation": 10,
    "audio_generation_fal": 10,
    "audio_inpainting": 10,
}

# Special credit amounts
PRO_UPGRADE_BONUS = 10000  # Large bonus for upgrading to pro
PRO_UNLIMITED_BALANCE = 9999990  # Effectively unlimited balance for pro users
FREE_TIER_INITIAL_CREDITS = 100  # Initial credits for new free tier users