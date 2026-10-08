import asyncio
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
