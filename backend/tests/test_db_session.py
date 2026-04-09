from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


async def test_get_session_yields_async_session():
    from takehome.db.session import get_session

    gen = get_session()
    session = await gen.__anext__()
    assert isinstance(session, AsyncSession)

    # Close the generator to trigger the context manager cleanup
    try:
        await gen.__anext__()
    except StopAsyncIteration:
        pass
