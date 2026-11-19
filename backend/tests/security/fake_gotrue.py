"""A minimal in-process fake of the Supabase Auth (GoTrue) HTTP API for auth regression tests.

It speaks real HTTP on 127.0.0.1, so the gotrue / supabase_auth client is exercised unmodified whatever its
version or HTTP library. Tokens are unsigned-in-spirit JWTs (HS256 with a test key) that map to users server-side.
Every request is recorded so tests can assert what the backend sent.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import jwt

_TEST_SIGNING_KEY = "fake-gotrue-test-signing-key-not-a-secret-0123456789"


@dataclass
class FakeUser:
    id: str
    email: str
    password: str


@dataclass
class RecordedRequest:
    method: str
    path: str
    query: Dict[str, List[str]]
    authorization: Optional[str]
    body: Any


@dataclass
class FakeGoTrueState:
    users: Dict[str, FakeUser] = field(default_factory=dict)  # by id
    tokens: Dict[str, str] = field(default_factory=dict)  # access token -> user id
    requests: List[RecordedRequest] = field(default_factory=list)
    pkce_codes: Dict[str, str] = field(default_factory=dict)  # auth code -> user id

    def user_by_email(self, email: str) -> Optional[FakeUser]:
        return next((u for u in self.users.values() if u.email == email), None)

    def add_user(self, email: str, password: str) -> FakeUser:
        user = FakeUser(id=str(uuid.uuid4()), email=email, password=password)
        self.users[user.id] = user
        return user

    def issue_token(self, user: FakeUser) -> str:
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": user.id,
                "email": user.email,
                "aud": "authenticated",
                "role": "authenticated",
                "iat": now,
                "exp": now + 3600,
                "jti": str(uuid.uuid4()),
            },
            _TEST_SIGNING_KEY,
            algorithm="HS256",
        )
        self.tokens[token] = user.id
        return token


def _user_json(user: FakeUser) -> Dict[str, Any]:
    return {
        "id": user.id,
        "aud": "authenticated",
        "role": "authenticated",
        "email": user.email,
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


def _session_json(state: FakeGoTrueState, user: FakeUser) -> Dict[str, Any]:
    return {
        "access_token": state.issue_token(user),
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": int(time.time()) + 3600,
        "refresh_token": f"refresh-{uuid.uuid4()}",
        "user": _user_json(user),
    }


def _error(status: int, error_code: str, msg: str) -> tuple[int, Dict[str, Any]]:
    return status, {"code": status, "error_code": error_code, "msg": msg}


class FakeGoTrue:
    """Context manager running the fake on a background thread. `url` is the Supabase project URL."""

    def __init__(self) -> None:
        self.state = FakeGoTrueState()
        state = self.state

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: Any) -> None:  # silence the default stderr logging
                pass

            def _respond(self, status: int, body: Any) -> None:
                payload = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def _handle(self, method: str) -> None:
                parsed = urlparse(self.path)
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                body = json.loads(raw) if raw else None
                authorization = self.headers.get("Authorization")
                state.requests.append(
                    RecordedRequest(method, parsed.path, parse_qs(parsed.query), authorization, body)
                )
                status, response = self._route(method, parsed.path, parse_qs(parsed.query), authorization, body)
                self._respond(status, response)

            def _bearer_user(self, authorization: Optional[str]) -> Optional[FakeUser]:
                if not authorization or not authorization.startswith("Bearer "):
                    return None
                user_id = state.tokens.get(authorization[len("Bearer "):].strip())
                return state.users.get(user_id) if user_id else None

            def _route(self, method, path, query, authorization, body):  # noqa: C901
                if path == "/auth/v1/signup" and method == "POST":
                    if state.user_by_email(body["email"]):
                        return _error(422, "user_already_exists", "User already registered")
                    user = state.add_user(body["email"], body["password"])
                    return 200, _session_json(state, user)
                if path == "/auth/v1/token" and method == "POST":
                    grant_type = query.get("grant_type", [""])[0]
                    if grant_type == "password":
                        user = state.user_by_email(body.get("email", ""))
                        if not user or user.password != body.get("password"):
                            return _error(400, "invalid_credentials", "Invalid login credentials")
                        return 200, _session_json(state, user)
                    if grant_type == "pkce":
                        user_id = state.pkce_codes.pop(body.get("auth_code") or "", None)
                        if not user_id or not body.get("code_verifier"):
                            return _error(400, "bad_code_verifier", "invalid flow state")
                        return 200, _session_json(state, state.users[user_id])
                    return _error(400, "unsupported_grant_type", f"unsupported grant_type {grant_type}")
                if path == "/auth/v1/user" and method == "GET":
                    user = self._bearer_user(authorization)
                    if not user:
                        return _error(401, "bad_jwt", "invalid JWT")
                    return 200, _user_json(user)
                if path == "/auth/v1/user" and method == "PUT":
                    user = self._bearer_user(authorization)
                    if not user:
                        return _error(401, "bad_jwt", "invalid JWT")
                    if "password" in (body or {}):
                        user.password = body["password"]
                    return 200, _user_json(user)
                if path == "/auth/v1/recover" and method == "POST":
                    return 200, {}
                return _error(404, "not_found", f"{method} {path} is not implemented by the fake")

            def do_GET(self) -> None:
                self._handle("GET")

            def do_POST(self) -> None:
                self._handle("POST")

            def do_PUT(self) -> None:
                self._handle("PUT")

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}"

    def __enter__(self) -> "FakeGoTrue":
        self._thread.start()
        return self

    def __exit__(self, *exc: Any) -> None:
        self._server.shutdown()
        self._server.server_close()
