from collections.abc import Iterator

import pytest

from lerobot_lens.services.sessions import manager


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def isolate_global_sessions() -> Iterator[None]:
    """Keep API tests independent from module-global session state."""
    manager._sessions.clear()
    yield
    manager._sessions.clear()
