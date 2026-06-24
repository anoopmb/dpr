"""Shared pytest fixtures.

Unit tests under app/tests/unit exercise app/domain directly and need no
database or settings. Integration tests (app/tests/integration, added later)
should use Testcontainers to spin up a real Postgres rather than mocking it.
"""
