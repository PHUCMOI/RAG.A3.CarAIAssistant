import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from app.infrastructure.ai.question_understanding import understand


def interpret(text, result, context=None):
    provider = AsyncMock()
    provider._chat.return_value = result
    with patch('app.infrastructure.ai.question_understanding.title_provider', return_value=provider):
        return asyncio.run(understand(text, context))


def test_payment_typo_is_understood_without_changing_the_original_reference():
    result = interpret('don AW-DEMO-0001 con phai thanh taon bn?', {
        'question': 'Đơn AW-DEMO-0001 còn phải thanh toán bao nhiêu?', 'route': 'orders',
        'needsClarification': False, 'clarification': None})
    assert result.route == 'orders'
    assert 'thanh toán' in result.question


def test_model_cannot_correct_an_order_code_or_invent_an_amount():
    text = 'AW-DEMO-OO01 con no bao nhieu'
    result = interpret(text, {'question': 'AW-DEMO-0001 còn nợ 500 triệu?',
        'route': 'orders', 'needsClarification': False, 'clarification': None})
    assert result.question == text


def test_unclear_question_is_a_clarification_not_a_guessed_tool():
    result = interpret('cai do sao roi', {'question': 'Cái đó sao rồi?', 'route': 'catalogue',
        'needsClarification': True, 'clarification': 'Bạn đang hỏi xe hay đơn hàng nào?'})
    assert result.route == 'clarification'
    assert result.clarification == 'Bạn đang hỏi xe hay đơn hàng nào?'


def test_unresolved_reference_cannot_be_sent_as_a_complete_catalogue_question():
    result = interpret('Chiếc xe bên trên giá khác bao nhiêu với Honda CRV?', {
        'question': 'Giá Honda CR-V bao nhiêu?', 'route': 'catalogue',
        'needsClarification': False, 'clarification': 'Bạn muốn so sánh mẫu xe nào với Honda CR-V?'},
        {'unresolvedCarReference': True, 'lastContexts': []})
    assert result.route == 'clarification'
    assert result.needs_clarification is True
    assert result.clarification == 'Bạn muốn so sánh mẫu xe nào với Honda CR-V?'


@pytest.mark.parametrize('question,rewritten', [
    ('Còn bảo hành của hai chiếc đó thì sao?', 'Bảo hành của Mazda CX-5 và Honda CR-V thế nào?'),
    ('Tôi ưu tiên giá thấp hơn thì nên cân nhắc chiếc nào?',
     'Giữa Mazda CX-5 và Honda CR-V, ưu tiên giá thấp hơn thì nên cân nhắc chiếc nào?'),
])
def test_followup_can_inherit_digits_in_verified_car_names(question, rewritten):
    result = interpret(question, {'question': rewritten, 'route': 'catalogue',
        'needsClarification': False, 'clarification': None}, {'lastContexts': [
            {'carId': 'mazda', 'displayName': 'Mazda CX-5'}, {'carId': 'honda', 'displayName': 'Honda CR-V'}]})
    assert result.question == rewritten
    assert not result.needs_clarification


@pytest.mark.parametrize('rewritten', [
    'Mazda CX-5 và Honda CR-V chênh nhau 500 triệu.',
    'Giá Mazda CX-50 và Honda CR-V thế nào?',
])
def test_history_names_do_not_authorize_new_amounts_or_new_models(rewritten):
    question = 'Giá của hai chiếc đó thế nào?'
    result = interpret(question, {'question': rewritten, 'route': 'catalogue',
        'needsClarification': False, 'clarification': None}, {'lastContexts': [
            {'carId': 'mazda', 'displayName': 'Mazda CX-5'}, {'carId': 'honda', 'displayName': 'Honda CR-V'}]})
    assert result.question == question


def test_first_authenticated_catalogue_turn_accepts_null_history():
    question = 'Giá Honda CR-V thế nào?'
    result = interpret(question, {'question': question, 'route': 'catalogue',
        'needsClarification': False, 'clarification': None}, {'lastContexts': None})
    assert result.question == question
