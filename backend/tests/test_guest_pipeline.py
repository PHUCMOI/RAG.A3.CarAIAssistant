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
    with patch('app.routers.guest_chat.understand', model):
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


def test_guest_explicit_order_request_requires_login_even_when_bedrock_is_down(client):
    model = AsyncMock(side_effect=RuntimeError('Bedrock unavailable'))
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={'question':
            'Tôi muốn đổi lịch nhận đơn AW-8617AE4D4CF8 sang 21/10/2026 vì bận công tác. Hãy tạo đề nghị giúp tôi.'})
    assert response.status_code == 200
    assert response.json()['requiresLogin'] is True
    assert response.json()['grounded'] is False
    assert response.json()['status'] == 'needs_clarification'
    assert 'đăng nhập' in response.json()['answer']
    model.assert_not_awaited()


def test_guest_account_intent_does_not_need_answer_generation(client):
    model = AsyncMock(return_value=understanding('Tôi đã thanh toán bao nhiêu?', 'orders'))
    with patch('app.routers.guest_chat.understand', model), patch('app.infrastructure.ai.natural_answers.compose_grounded',
            AsyncMock(side_effect=RuntimeError('Bedrock unavailable'))) as composer:
        response = client.post('/api/chat/turns', json={'question': 'Tôi đã thanh toán bao nhiêu?'})
    assert response.status_code == 200
    assert response.json()['requiresLogin'] is True
    composer.assert_not_awaited()


def test_guest_price_followup_uses_verified_history_and_keeps_both_cars(client, mock_db):
    from tests.conftest import MOCK_CAR_ROW
    mock_db.cars.append(dict(MOCK_CAR_ROW, car_id='mazda', display_name='Mazda CX-5', brand_name='Mazda',
                            aliases='["CX-5"]', price_vnd_from=699000000))
    async def echo(question, context):
        return understanding(question)
    model = AsyncMock(side_effect=echo)
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={
            'question': 'Chiếc xe bên trên giá cả khác bao nhiêu với Honda CRV?',
            'lastContexts': [{'carId': 'mazda', 'displayName': 'Untrusted model 999'}]})
    assert response.status_code == 200
    data = response.json()
    assert data['intent'] == 'compare_cars'
    assert {c['carId'] for c in data['contexts']} == {'mazda', 'car_honda_crv'}
    assert 'Mazda CX-5' in model.call_args.args[0]
    assert 'Untrusted model 999' not in model.call_args.args[0]


def test_guest_missing_reference_shows_llm_clarification_without_answer_audit(client):
    question = 'Chiếc xe bên trên giá cả khác bao nhiêu với Honda CRV?'
    clarification = 'Bạn muốn so sánh giá mẫu xe nào với Honda CR-V?'
    model = AsyncMock(return_value=understanding(question, 'clarification', clarification=clarification))
    composer = AsyncMock(side_effect=AssertionError('Do not audit a clarification as a price claim'))
    with patch('app.routers.guest_chat.understand', model), patch('app.routers.chat.compose_grounded', composer):
        response = client.post('/api/chat/turns', json={'question': question})
    assert response.status_code == 200
    assert response.json()['answer'] == clarification
    assert response.json()['status'] == 'needs_clarification'
    assert response.json()['grounded'] is False
    assert model.call_args.args[1]['unresolvedCarReference'] is True
    composer.assert_not_awaited()


def test_guest_multiple_previous_cars_does_not_select_first_one(client, mock_db):
    from tests.conftest import MOCK_CAR_ROW
    mock_db.cars.append(dict(MOCK_CAR_ROW, car_id='mazda', display_name='Mazda CX-5', brand_name='Mazda', aliases='["CX-5"]'))
    model = AsyncMock(return_value=understanding('Xe bên trên giá bao nhiêu?', 'clarification',
        clarification='Bạn muốn hỏi Mazda CX-5 hay Honda CR-V?'))
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={'question': 'Xe bên trên giá bao nhiêu?',
            'lastContexts': [{'carId': 'mazda', 'displayName': 'Mazda CX-5'},
                             {'carId': 'car_honda_crv', 'displayName': 'Honda CR-V'}]})
    assert response.status_code == 200
    assert response.json()['status'] == 'needs_clarification'
    assert model.call_args.args[1]['unresolvedCarReference'] is True


def test_guest_scope_question_does_not_require_specific_car(client):
    model = AsyncMock(side_effect=AssertionError('Known dataset policy does not need car selection'))
    with patch('app.routers.guest_chat.understand', model):
        response = client.post('/api/chat/turns', json={
            'question': 'Thông số trong dữ liệu có đúng với phiên bản bán tại Việt Nam không?'})
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['intent'] == 'ask_data_scope'
    assert 'Anh' in response.json()['answer'] and 'Việt Nam' in response.json()['answer']
