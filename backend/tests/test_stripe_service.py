"""Stripe integration code against current stripe-python (17.x, API version 2026-11-18.endive), offline."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import stripe

from app2.services.stripe_service import (
    StripeService,
    _invoice_payment_intent_id,
    subscription_billing_period,
)

WEBHOOK_SECRET = "whsec_test_secret"


def _signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    signature = hmac.new(WEBHOOK_SECRET.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={timestamp},v1={signature}"


SUBSCRIPTION_BASIL = {
    "id": "sub_123",
    "object": "subscription",
    "customer": "cus_123",
    "status": "active",
    "cancel_at_period_end": False,
    "canceled_at": None,
    "trial_end": None,
    "items": {
        "object": "list",
        "data": [
            {
                "id": "si_1",
                "object": "subscription_item",
                "current_period_start": 1_760_000_000,
                "current_period_end": 1_762_600_000,
                "price": {"id": "price_123", "object": "price"},
            }
        ],
    },
}


def test_webhook_event_is_a_plain_dict():
    body, header = _signed(
        {
            "id": "evt_1",
            "object": "event",
            "type": "customer.subscription.updated",
            "data": {"object": SUBSCRIPTION_BASIL},
        }
    )

    event = StripeService.verify_webhook_signature(body, header, WEBHOOK_SECRET)

    assert type(event) is dict
    subscription = event["data"]["object"]
    assert type(subscription) is dict
    # The handlers rely on dict semantics, and payment events store the payload as JSON.
    assert subscription.get("canceled_at") is None
    assert subscription["items"]["data"][0]["price"]["id"] == "price_123"
    json.dumps(event)


def test_webhook_signature_is_still_verified():
    body, _ = _signed({"id": "evt_1", "object": "event", "type": "x", "data": {"object": {}}})
    with pytest.raises(stripe.SignatureVerificationError):
        StripeService.verify_webhook_signature(body, "t=1,v1=deadbeef", WEBHOOK_SECRET)


def test_billing_period_comes_from_subscription_items_since_basil():
    assert subscription_billing_period(SUBSCRIPTION_BASIL) == (1_760_000_000, 1_762_600_000)


def test_billing_period_of_a_pre_basil_payload():
    legacy = {**SUBSCRIPTION_BASIL, "current_period_start": 1, "current_period_end": 2}
    assert subscription_billing_period(legacy) == (1, 2)


def test_billing_period_without_items_fails_loudly():
    with pytest.raises(ValueError, match="no items"):
        subscription_billing_period({**SUBSCRIPTION_BASIL, "items": {"data": []}})


@pytest.mark.parametrize(
    "invoice,expected",
    [
        ({"id": "in_1", "payment_intent": "pi_old"}, "pi_old"),
        (
            {"id": "in_1", "payments": {"data": [{"payment": {"type": "payment_intent", "payment_intent": "pi_new"}}]}},
            "pi_new",
        ),
        (
            {
                "id": "in_1",
                "payments": {"data": [{"payment": {"type": "payment_intent", "payment_intent": {"id": "pi_exp"}}}]},
            },
            "pi_exp",
        ),
        ({"id": "in_1"}, None),
    ],
)
def test_invoice_payment_intent_id(invoice, expected):
    assert _invoice_payment_intent_id(invoice) == expected


@pytest.mark.parametrize("ui_mode,stripe_ui_mode", [("hosted", "hosted_page"), ("embedded", "embedded_page")])
async def test_checkout_session_params(monkeypatch, ui_mode, stripe_ui_mode):
    service = StripeService()
    monkeypatch.setattr(service, "create_or_get_customer", AsyncMock(return_value="cus_123"))
    create = MagicMock(return_value=SimpleNamespace(id="cs_1", url="https://checkout", client_secret="secret"))
    monkeypatch.setattr(stripe.checkout.Session, "create", create)

    result = await service.create_checkout_session(
        user=SimpleNamespace(id="u1"),
        price_id="price_123",
        success_url="https://app/ok?session_id={CHECKOUT_SESSION_ID}",
        cancel_url="https://app/cancel",
        ui_mode=ui_mode,
    )

    params = create.call_args.kwargs
    assert params["ui_mode"] == stripe_ui_mode
    assert params["allowed_payment_method_types"] == ["card"]
    assert "payment_method_types" not in params
    if ui_mode == "embedded":
        assert params["return_url"] == "https://app/ok?session_id={CHECKOUT_SESSION_ID}"
        assert "success_url" not in params and "cancel_url" not in params
        assert result["client_secret"] == "secret"
    else:
        assert (params["success_url"], params["cancel_url"]) == ("https://app/ok?session_id={CHECKOUT_SESSION_ID}", "https://app/cancel")


async def test_checkout_rejects_an_unknown_ui_mode():
    with pytest.raises(ValueError, match="ui_mode"):
        await StripeService().create_checkout_session(
            user=SimpleNamespace(id="u1"), price_id="p", success_url="s", cancel_url="c", ui_mode="popup"
        )
