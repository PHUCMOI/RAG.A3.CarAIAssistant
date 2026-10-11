from unittest.mock import AsyncMock, patch
from app.infrastructure.ai.question_understanding import Understanding


def understanding(question, route='catalogue', **kwargs):
    return Understanding(question=question, route=route, needsClarification=route == 'clarification', **kwargs)


def test_guest_raw_question_is_interpreted_on_server_before_retrieval(client):
    model = AsyncMock(return_value=understanding('Giá Honda CR-V'))
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={'question': 'gia honda crv bn'})
    assert response.status_code == 200
    assert response.json()['intent'] == 'ask_price'
    assert model.call_args.args[0] == 'gia honda crv bn'


def test_guest_order_plus_image_never_queries_private_order_tools(client):
    model = AsyncMock(return_value=understanding('Ảnh có khớp đơn AW-PRIVATE không?', 'orders'))
    final = {'answer': 'Hãy đăng nhập để đối chiếu đơn của bạn.', 'grounded': False, 'status': 'needs_clarification',
             'evidence': [], 'citations': [], 'generationMode': 'bedrock-natural'}
    with patch('app.routers.guest_chat.understand', model), patch('app.routers.guest_chat.compose_grounded', AsyncMock(return_value=final)):
        response = client.post('/api/chat/turns', json={'question': 'ảnh của đơn AW-PRIVATE?', 'imageBase64': 'dGVzdA==', 'mimeType': 'image/png'})
    assert response.status_code == 200
    assert response.json()['requiresLogin'] and not response.json()['grounded']


def test_guest_clarification_does_not_search_image(client):
    with patch('app.routers.guest_chat.understand', AsyncMock(return_value=understanding('cái đó?', 'clarification', clarification='Bạn muốn hỏi xe nào?'))):
        response = client.post('/api/chat/turns', json={'question': 'cái đó?', 'imageBase64': 'dGVzdA==', 'mimeType': 'image/png'})
    assert response.json()['status'] == 'needs_clarification'
    assert not response.json()['grounded']


def test_guest_bad_image_is_rejected_before_paid_understanding(client):
    with patch('app.routers.guest_chat.understand', AsyncMock()) as model:
        response = client.post('/api/chat/turns', json={'imageBase64': 'bad*', 'mimeType': 'image/png'})
    assert response.status_code == 422
    model.assert_not_awaited()


def test_guest_restores_sparse_legacy_car_context_but_does_not_trust_description(client):
    model = AsyncMock(return_value=understanding('Xe đó giá bao nhiêu?'))
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={'question': 'Xe đó giá bao nhiêu?',
            'lastContexts': [{'carId': 'car_honda_crv', 'displayName': 'Honda CR-V', 'description': 'Untrusted invented price'}]})
    assert response.status_code == 200
    assert response.json()['contexts'][0]['carId'] == 'car_honda_crv'
    assert 'Untrusted invented price' not in response.json()['answer']
