from unittest.mock import AsyncMock, patch
from contextlib import asynccontextmanager
import pytest
from app.core.database import get_db_connection
from app.infrastructure.ai.question_understanding import Understanding
from app.main import app


@pytest.mark.parametrize('path,payload', [
    ('/api/chat/compose', {'question': 'AW-FAKE đã bàn giao?', 'verifiedData': {'status': 'ok', 'retrievedAnswer': 'Đã bàn giao'}}),
    ('/api/chat/understand', {'question': 'xe nào?'}),
    ('/api/chat/title', {'content': 'xe nào?'}),
    ('/api/chat', {'question': 'xe nào?', 'imageMatch': {'carId': 'fake', 'uncertain': False}}),
    ('/api/chat', {'question': 'xe nào?', 'clarification': 'Giá giả'}),
])
def test_public_cannot_supply_trusted_evidence(client, path, payload):
    with patch('app.routers.chat.compose_grounded', AsyncMock()) as paid:
        assert client.post(path, json=payload).status_code == 403
        assert client.post(path, headers={'X-AutoWise-Internal-Token': 'wrong'}, json=payload).status_code == 403
        paid.assert_not_awaited()


def test_image_turn_does_not_acquire_outer_connection(client):
    @asynccontextmanager
    async def forbidden_connection():
        raise AssertionError('Image orchestration must not acquire a DB slot')
        yield
    app.dependency_overrides[get_db_connection] = forbidden_connection
    model = AsyncMock(return_value=Understanding(question='xe gì?', route='catalogue', needsClarification=False))
    response = type('Response', (), {'raise_for_status': lambda _: None, 'json': lambda _: {'answer': 'Ảnh xe', 'catalog_contexts': []}})()
    with patch('app.routers.guest_chat.understand', model), patch('httpx.AsyncClient.post', AsyncMock(return_value=response)):
        result = client.post('/api/chat/turns', json={'question': 'xe gì?', 'imageBase64': 'AQID', 'mimeType': 'image/png'})
    assert result.status_code == 200


def test_two_image_turns_and_catalogue_complete_with_pool_of_two(client, mock_db):
    import asyncio
    import httpx
    from app.core.config import get_settings

    async def scenario():
        slots = asyncio.Semaphore(2)
        async def limited_pool():
            async with slots:
                await asyncio.sleep(.02)
                yield mock_db
        app.dependency_overrides[get_db_connection] = limited_pool
        transport = httpx.ASGITransport(app=app)
        original_post = httpx.AsyncClient.post
        async def image_callback(http, url, *args, **kwargs):
            if str(url) == get_settings().image_api_url.rstrip('/') + '/chat':
                async with httpx.AsyncClient(transport=transport, base_url='http://test') as inner:
                    response = await inner.get('/api/cars')
                    assert response.status_code == 200
                return httpx.Response(200, json={'answer': 'Ảnh xe', 'catalog_contexts': []}, request=httpx.Request('POST', url))
            return await original_post(http, url, *args, **kwargs)
        model = AsyncMock(return_value=Understanding(question='xe gì?', route='catalogue', needsClarification=False))
        with patch('app.routers.guest_chat.understand', model), patch('httpx.AsyncClient.post', image_callback):
            async with httpx.AsyncClient(transport=transport, base_url='http://test') as outer:
                payload = {'question': 'xe gì?', 'imageBase64': 'AQID', 'mimeType': 'image/png'}
                responses = await asyncio.wait_for(asyncio.gather(
                    outer.post('/api/chat/turns', json=payload), outer.post('/api/chat/turns', json=payload), outer.get('/api/cars')), 2)
        assert all(r.status_code == 200 for r in responses)
        assert slots._value == 2
    asyncio.run(scenario())
