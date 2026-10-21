import pytest


@pytest.fixture(autouse=True)
async def _clean(clean_storage: None) -> None:
    pass
