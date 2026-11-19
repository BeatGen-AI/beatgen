"""Regression tests: Supabase auth calls never act on a session stored by another request.

Before the fix the backend used one process-wide Supabase client for auth. Sign-in stored the session on it, so:
  1. `Authorization: Bearer ` (empty token) authenticated as the last user to log in on that worker, because
     gotrue's `get_user("")` falls back to the stored session;
  2. `POST /auth/add-password` (and the change-password path) called `update_user()` on the stored session, so an
     attacker could overwrite the password of whoever logged in after them.

These tests drive the real auth code against a fake GoTrue HTTP server (tests/security/fake_gotrue.py).
"""

from __future__ import annotations

import ast
import pathlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from supabase import create_client

from app2.api import dependencies
from app2.api.routes import auth as auth_routes
from app2.core.config import settings
from app2.core.exceptions import DatabaseException, UnauthorizedException
from app2.infrastructure.database import supabase_client as supabase_client_module
from app2.services import auth_service as auth_service_module
from app2.services.auth_service import AuthService
from app2.services.user_service import UserService

from .fake_gotrue import FakeGoTrue

VICTIM_EMAIL = "victim@example.com"
VICTIM_PASSWORD = "Victim-Original-1!"
ATTACKER_EMAIL = "attacker@example.com"
ATTACKER_PASSWORD = "Attacker-Original-1!"
NEW_PASSWORD = "Pwned-By-Attacker-1!"

APP2_DIR = pathlib.Path(__file__).resolve().parents[2] / "app2"


@pytest.fixture
def gotrue(monkeypatch):
    with FakeGoTrue() as fake:
        # A JWT-shaped anon key, as Supabase issues.
        anon_key = jwt.encode({"role": "anon"}, "anon-key-signing-secret-0123456789", algorithm="HS256")
        monkeypatch.setattr(settings.supabase, "URL", fake.url)
        monkeypatch.setattr(settings.supabase, "KEY", anon_key)
        # The process-wide client, pointed at the fake too: any auth call routed through it (the vulnerability)
        # would store a session there, which `_assert_no_shared_session` catches.
        monkeypatch.setattr(
            supabase_client_module.SupabaseClient, "_client", create_client(fake.url, anon_key)
        )
        yield fake
        _assert_no_shared_session()


def _assert_no_shared_session():
    assert supabase_client_module.supabase.client.auth.get_session() is None


@pytest.fixture
def user_repository():
    repo = MagicMock()
    repo.create_profile = AsyncMock(side_effect=lambda **kw: SimpleNamespace(**kw))
    return repo


@pytest.fixture
def auth_service(user_repository, monkeypatch):
    monkeypatch.setattr(auth_service_module.credits_service, "initialize_user_credits", AsyncMock())
    return AuthService(user_repository)


def _app_with(auth_service: AuthService) -> FastAPI:
    app = FastAPI()
    app.include_router(auth_routes.router, prefix="/auth")

    @app.get("/me")
    async def me(user=Depends(dependencies.get_current_user)):
        return {"id": user["id"]}

    app.dependency_overrides[dependencies.get_auth_service] = lambda: auth_service
    return app


def _requests_without_bearer_token(fake: FakeGoTrue):
    """Requests to the session-relying endpoints that carry no caller token (or only the anon key)."""
    anon = f"Bearer {settings.supabase.KEY}"
    return [
        r
        for r in fake.state.requests
        if r.path == "/auth/v1/user" and (not r.authorization or r.authorization.strip() in ("Bearer", anon))
    ]


async def _sign_up_and_log_in(auth_service: AuthService):
    victim = await auth_service.create_user(VICTIM_EMAIL, VICTIM_PASSWORD)
    attacker = await auth_service.create_user(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    attacker_login = await auth_service.login_user(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    # The victim logs in last: with a shared client, theirs would be the stored session.
    victim_login = await auth_service.login_user(VICTIM_EMAIL, VICTIM_PASSWORD)
    return victim, attacker, attacker_login, victim_login


@pytest.mark.parametrize("header", ["Bearer ", "Bearer    ", "Bearer \t"])
async def test_empty_or_whitespace_bearer_token_is_401(gotrue, auth_service, header):
    _, _, _, victim_login = await _sign_up_and_log_in(auth_service)
    client = TestClient(_app_with(auth_service))

    response = client.get("/me", headers={"Authorization": header})

    assert response.status_code == 401
    assert _requests_without_bearer_token(gotrue) == []
    # Sanity check: the victim's own token works.
    ok = client.get("/me", headers={"Authorization": f"Bearer {victim_login['access_token']}"})
    assert ok.status_code == 200
    assert ok.json() == {"id": victim_login["user_id"]}


async def test_missing_authorization_header_is_401(gotrue, auth_service):
    await _sign_up_and_log_in(auth_service)
    assert TestClient(_app_with(auth_service)).get("/me").status_code == 401


async def test_verify_token_never_consults_a_stored_session(gotrue, auth_service):
    _, _, attacker_login, victim_login = await _sign_up_and_log_in(auth_service)

    for token in ("", "   ", None):
        with pytest.raises(UnauthorizedException):
            await auth_service.verify_token(token)
        with pytest.raises(UnauthorizedException):
            await auth_service.verify_token(token, use_jwt_verification=False)
        with pytest.raises(DatabaseException):
            supabase_client_module.supabase.verify_token(token)

    assert _requests_without_bearer_token(gotrue) == []
    # Explicit tokens resolve to their own users through the Supabase API path.
    assert (await auth_service.verify_token(victim_login["access_token"], use_jwt_verification=False))["id"] == victim_login["user_id"]
    assert (await auth_service.verify_token(attacker_login["access_token"], use_jwt_verification=False))["id"] == attacker_login["user_id"]


async def test_add_password_changes_only_the_callers_account(gotrue, auth_service):
    victim, attacker, attacker_login, victim_login = await _sign_up_and_log_in(auth_service)
    client = TestClient(_app_with(auth_service))

    response = client.post(
        "/auth/add-password",
        json={"password": NEW_PASSWORD},
        headers={"Authorization": f"Bearer {attacker_login['access_token']}"},
    )

    assert response.status_code == 200, response.text
    users = gotrue.state.users
    assert users[victim["user_id"]].password == VICTIM_PASSWORD
    assert users[attacker["user_id"]].password == NEW_PASSWORD
    # The victim still logs in with their own password, and not with the attacker's.
    assert (await auth_service.login_user(VICTIM_EMAIL, VICTIM_PASSWORD))["user_id"] == victim["user_id"]
    with pytest.raises(UnauthorizedException):
        await auth_service.login_user(VICTIM_EMAIL, NEW_PASSWORD)
    # Every password update carried the attacker's own token.
    updates = [r for r in gotrue.state.requests if r.method == "PUT" and r.path == "/auth/v1/user"]
    assert [r.authorization for r in updates] == [f"Bearer {attacker_login['access_token']}"]


async def test_add_password_rejects_a_token_of_another_user(gotrue, auth_service):
    victim, attacker, attacker_login, _ = await _sign_up_and_log_in(auth_service)

    with pytest.raises(UnauthorizedException):
        await auth_service.add_password_to_oauth_user(
            user_id=victim["user_id"], password=NEW_PASSWORD, access_token=attacker_login["access_token"]
        )
    for token in ("", "  ", None):
        with pytest.raises(UnauthorizedException):
            await auth_service.add_password_to_oauth_user(
                user_id=attacker["user_id"], password=NEW_PASSWORD, access_token=token
            )

    assert gotrue.state.users[victim["user_id"]].password == VICTIM_PASSWORD
    assert gotrue.state.users[attacker["user_id"]].password == ATTACKER_PASSWORD
    assert not [r for r in gotrue.state.requests if r.method == "PUT"]


async def test_change_password_changes_only_the_callers_account(gotrue, auth_service):
    victim, attacker, _, _ = await _sign_up_and_log_in(auth_service)
    profiles = {
        victim["user_id"]: SimpleNamespace(id=victim["user_id"], email=VICTIM_EMAIL),
        attacker["user_id"]: SimpleNamespace(id=attacker["user_id"], email=ATTACKER_EMAIL),
    }
    repo = MagicMock()
    repo.get_profile = AsyncMock(side_effect=lambda user_id: profiles[str(user_id)])
    user_service = UserService(repo)

    # The victim logs in after the attacker's session exists.
    await auth_service.login_user(VICTIM_EMAIL, VICTIM_PASSWORD)
    await user_service.change_password(attacker["user_id"], ATTACKER_PASSWORD, NEW_PASSWORD)

    assert gotrue.state.users[victim["user_id"]].password == VICTIM_PASSWORD
    assert gotrue.state.users[attacker["user_id"]].password == NEW_PASSWORD

    # A wrong current password changes nothing.
    with pytest.raises(UnauthorizedException):
        await user_service.change_password(victim["user_id"], "Wrong-Password-1!", NEW_PASSWORD)
    assert gotrue.state.users[victim["user_id"]].password == VICTIM_PASSWORD


async def test_password_reset_with_recovery_token_changes_only_that_account(gotrue, auth_service):
    victim, attacker, _, _ = await _sign_up_and_log_in(auth_service)
    recovery_token = gotrue.state.issue_token(gotrue.state.users[attacker["user_id"]])

    assert await auth_service.reset_password_with_recovery_token(NEW_PASSWORD, recovery_token) is True

    assert gotrue.state.users[attacker["user_id"]].password == NEW_PASSWORD
    assert gotrue.state.users[victim["user_id"]].password == VICTIM_PASSWORD


async def test_oauth_exchange_uses_the_verifier_and_leaves_no_shared_session(gotrue, auth_service, user_repository):
    from app2.core.exceptions import NotFoundException

    user_repository.get_profile = AsyncMock(side_effect=NotFoundException("profile"))
    url = await auth_service.get_google_auth_url(response=MagicMock())
    assert "code_challenge=" in url

    victim = gotrue.state.add_user("oauth-victim@example.com", "unused")
    gotrue.state.pkce_codes["auth-code-1"] = victim.id
    result = await auth_service.handle_google_callback("auth-code-1", request=MagicMock(), response=MagicMock())
    assert result["user_id"] == victim.id

    exchange = [r for r in gotrue.state.requests if r.path == "/auth/v1/token" and r.query.get("grant_type") == ["pkce"]]
    assert len(exchange) == 1 and exchange[0].body["code_verifier"]
    # The verifier is single-use: a replayed callback fails loudly.
    with pytest.raises(UnauthorizedException):
        await auth_service.handle_google_callback("auth-code-1", request=MagicMock(), response=MagicMock())


def test_new_auth_client_is_isolated_per_call(gotrue):
    first = supabase_client_module.new_auth_client()
    gotrue.state.add_user("solo@example.com", "Solo-Password-1!")
    first.sign_in_with_password({"email": "solo@example.com", "password": "Solo-Password-1!"})
    assert first.get_session() is not None
    second = supabase_client_module.new_auth_client()
    assert second is not first
    assert second.get_session() is None


async def test_no_session_is_left_on_the_shared_client(gotrue, auth_service):
    await _sign_up_and_log_in(auth_service)
    _assert_no_shared_session()


def test_no_app_code_calls_auth_on_the_shared_supabase_client():
    """`supabase.client.auth.*` / `supabase.auth()` on the process-wide client is how sessions leaked across users."""
    offenders = []
    for path in APP2_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "auth":
                target = node.value
                if isinstance(target, ast.Attribute) and target.attr in ("client", "_client", "admin_client", "_admin_client"):
                    offenders.append(f"{path.relative_to(APP2_DIR.parent)}:{node.lineno}")
                if isinstance(target, ast.Name) and target.id == "supabase":
                    offenders.append(f"{path.relative_to(APP2_DIR.parent)}:{node.lineno}")
    assert offenders == []
