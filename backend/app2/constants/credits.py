"""
Credit system constants and helper functions for BeatGen
"""
from typing import Dict, Any, Optional


class UnknownModelCostError(ValueError):
    """Raised when a model has no entry in MODEL_COSTS."""

# Credit allocations per subscription tier (10x granular)
CREDIT_ALLOCATIONS = {
    "free": {"monthly": 100, "rollover": False},
    "starter": {"monthly": 500, "rollover": True},
    "creator": {"monthly": 1500, "rollover": True},
    "pro": {"monthly": -1, "rollover": False},  # -1 means unlimited
}

# Credit costs per operation (10x granular)
CREDIT_COSTS = {
    "audio_generation_fal": 10,
    "audio_inpainting": 10,
}

# Credit cost per assistant model, keyed by display name (the wire value the frontend sends).
# Formula: ceil(40 x input $/1M tokens) at list prices as of 2026-11-19. Must match the lineup in
# app2/llm/available_models.py and the frontend; see .scratch/app-refresh/spec.md.
MODEL_COSTS = {
    "Gemini 4 Carbon": 80,
    "Gemini 3.8 Flash": 33,
    "DeepSeek V4 Pro": 36,
    "DeepSeek V4.1 Flash": 12,
    "Claude Sonnet 5.5": 80,
    "Claude Opus 5.5": 160,
    "Claude Haiku 5.5": 4,
    "GPT-6.2 Sol": 80,
    "GPT-6.1 Terra": 40,
    "GPT-6.2 Astra": 320,
    "GPT-6 Luna": 4,
    "Llama 4 Maverick": 14,
    "Llama 4 Scout": 4,
}

# Special credit amounts
PRO_UPGRADE_BONUS = 10000  # Large bonus for upgrading to pro
PRO_UNLIMITED_BALANCE = 9999990  # Effectively unlimited balance for pro users
FREE_TIER_INITIAL_CREDITS = 100  # Initial credits for new free tier users

# Subscription tier hierarchy for comparisons
TIER_LEVELS = {"free": 0, "starter": 1, "creator": 2, "pro": 3}


def get_monthly_allocation(tier: str) -> int:
    """Get monthly credit allocation for a subscription tier."""
    return CREDIT_ALLOCATIONS.get(tier, CREDIT_ALLOCATIONS["free"])["monthly"]


def has_rollover(tier: str) -> bool:
    """Check if a subscription tier supports credit rollover."""
    return CREDIT_ALLOCATIONS.get(tier, CREDIT_ALLOCATIONS["free"])["rollover"]


def is_unlimited_tier(tier: str) -> bool:
    """Check if a subscription tier has unlimited credits."""
    return tier == "pro"


def get_tier_level(tier: str) -> int:
    """Get numeric level for tier comparison (higher number = better tier)."""
    return TIER_LEVELS.get(tier, 0)


def is_tier_upgrade(old_tier: str, new_tier: str) -> bool:
    """Check if changing from old_tier to new_tier is an upgrade."""
    return get_tier_level(new_tier) > get_tier_level(old_tier)


def calculate_upgrade_bonus(old_tier: str, new_tier: str) -> int:
    """Calculate bonus credits for upgrading between tiers."""
    if not is_tier_upgrade(old_tier, new_tier):
        return 0
    
    if new_tier == "pro":
        return PRO_UPGRADE_BONUS
    
    old_allocation = get_monthly_allocation(old_tier)
    new_allocation = get_monthly_allocation(new_tier)
    
    # For unlimited tiers, use 0 as base
    if old_allocation == -1:
        old_allocation = 0
    if new_allocation == -1:
        new_allocation = 0
    
    return max(0, new_allocation - old_allocation)


def get_operation_cost(operation: str) -> int:
    """Get credit cost for a specific operation."""
    if operation not in CREDIT_COSTS:
        raise ValueError(f"Unknown operation: {operation}. Available operations: {list(CREDIT_COSTS.keys())}")
    return CREDIT_COSTS[operation]


def get_model_credit_cost(model_display_name: str) -> int:
    """Get credit cost for a specific AI model.

    Args:
        model_display_name: The display name of the model (e.g., "Claude Sonnet 5.5", "GPT-6.2 Sol")

    Returns:
        Credit cost for the model.

    Raises:
        UnknownModelCostError: if the model has no credit cost. There is no default cost.
    """
    if model_display_name not in MODEL_COSTS:
        raise UnknownModelCostError(
            f"No credit cost defined for model {model_display_name!r}. Known models: {list(MODEL_COSTS)}"
        )
    return MODEL_COSTS[model_display_name]


def get_available_models_with_costs() -> Dict[str, int]:
    """Get all available models with their credit costs."""
    return MODEL_COSTS.copy()


def get_tier_info(tier: str) -> Dict[str, Any]:
    """Get complete information about a subscription tier."""
    if tier not in CREDIT_ALLOCATIONS:
        tier = "free"  # Default to free tier
    
    allocation_info = CREDIT_ALLOCATIONS[tier]
    return {
        "tier": tier,
        "monthly_allocation": allocation_info["monthly"],
        "has_rollover": allocation_info["rollover"],
        "is_unlimited": tier == "pro",
        "tier_level": get_tier_level(tier),
    }


def validate_tier(tier: str) -> bool:
    """Validate if a tier name is valid."""
    return tier in CREDIT_ALLOCATIONS


def get_available_tiers() -> list[str]:
    """Get list of all available subscription tiers."""
    return list(CREDIT_ALLOCATIONS.keys())