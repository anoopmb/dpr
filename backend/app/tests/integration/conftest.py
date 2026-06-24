"""Each pytest-asyncio test function runs on its own event loop. asyncpg
connections pooled by app.core.db's module-level engine are bound to the
loop that created them, so reusing the pool from a later test (on a new
loop) corrupts the connection on Windows' ProactorEventLoop. Disposing the
pool after every test forces a fresh connection per test's loop.
"""

import pytest_asyncio

from app.core.db import engine


@pytest_asyncio.fixture(autouse=True)
async def _dispose_engine_after_test():
    yield
    await engine.dispose()
