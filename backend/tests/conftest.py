"""Shared pytest configuration.

`app2.infrastructure.database.sqlmodel_client` requires `DATABASE_URL` at import time. Tests never open a database
connection (creating the async engine does not connect), so a placeholder URL is set when none is configured.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=disable")
