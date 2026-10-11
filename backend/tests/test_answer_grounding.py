import asyncio
from unittest.mock import AsyncMock, patch
import pytest
from fastapi import HTTPException
from app.infrastructure.ai.answer_grounding import review_answer, canonical_sources
from app.infrastructure.ai.natural_answers import validate_answer, compose_grounded


DATA = {'status': 'ok', 'cars': [
    {'displayName': 'Ford Edge', 'priceVndFrom': 1560000000},
    {'displayName': 'Honda HR-V', 'priceVndFrom': 699000000}],
    'evidence': [{'contextId': 'edge:price', 'section': 'price', 'carId': 'edge', 'content': 'Ford Edge: 1560000000 VND'},
                 {'contextId': 'hrv:price', 'section': 'price', 'carId': 'hrv', 'content': 'Honda HR-V: 699000000 VND'}],
    'citations': [{'contextId': 'edge:price', 'sourceId': 'ford', 'title': 'Ford'},
                  {'contextId': 'hrv:price', 'sourceId': 'honda', 'title': 'Honda'}]}


@pytest.mark.parametrize('answer', [
    'Ford Edge giá 699.000.000 VND.',
    '| Tiêu chí | Ford Edge | Honda HR-V |\n|---|---|---|\n| Giá | 699.000.000 VND | 1.560.000.000 VND |'])
def test_swapped_prices_are_rejected_before_model_review(answer):
    with pytest.raises(ValueError, match='different car'):
        validate_answer(answer, DATA)


def test_final_answer_references_filter_sources_even_if_draft_used_other_contexts():
    provider = AsyncMock()
    provider._chat.return_value = {'supported': True, 'contextIds': ['hrv:price'], 'reason': 'Supported'}
    final = asyncio.run(review_answer(provider, 'Giá HR-V?', 'Honda HR-V giá 699.000.000 VND.', DATA))
    assert final['grounded']
    assert [e['contextId'] for e in final['evidence']] == ['hrv:price']
    assert [c['sourceId'] for c in final['citations']] == ['honda']
    schema = provider._chat.call_args.args[1]
    assert schema['properties']['contextIds']['items']['enum'] == ['edge:price', 'hrv:price']


@pytest.mark.parametrize('review', [
    {'supported': False, 'contextIds': [], 'reason': 'Delivery status is not in the source'},
    {'supported': True, 'contextIds': ['invented'], 'reason': 'Supported'},
    {'supported': True, 'contextIds': [], 'reason': 'Supported'}])
def test_invalid_semantic_proof_never_produces_grounded_success(review):
    provider = AsyncMock()
    provider._chat.return_value = review
    with pytest.raises(ValueError):
        asyncio.run(review_answer(provider, 'đơn giao chưa?', 'Đã giao xe.', DATA))


def test_repeated_known_references_are_canonicalized_without_duplicate_evidence():
    provider = AsyncMock()
    provider._chat.return_value = {'supported': True, 'contextIds': ['hrv:price', 'hrv:price'], 'reason': 'Supported'}
    result = asyncio.run(review_answer(provider, 'Giá HR-V?', 'Honda HR-V giá 699.000.000 VND.', DATA))
    assert [e['contextId'] for e in result['evidence']] == ['hrv:price']


def test_invalid_references_are_reaudited_without_rewriting_the_answer():
    provider = AsyncMock()
    provider._chat.side_effect = [
        {'supported': True, 'contextIds': ['invented'], 'reason': 'Supported'},
        {'supported': True, 'contextIds': ['hrv:price'], 'reason': 'Source verified'}]
    answer = 'Honda HR-V giá 699.000.000 VND.'
    result = asyncio.run(review_answer(provider, 'Giá HR-V?', answer, DATA))
    assert result['answer'] == answer
    assert [e['contextId'] for e in result['evidence']] == ['hrv:price']
    assert provider._chat.await_count == 2


def test_reference_repair_cannot_override_an_unsupported_claim_verdict():
    provider = AsyncMock()
    provider._chat.side_effect = [
        {'supported': True, 'contextIds': ['invented'], 'reason': 'Supported'},
        {'supported': False, 'contextIds': ['hrv:price'], 'reason': 'Unsupported delivery claim'}]
    with pytest.raises(ValueError, match='unsupported claims'):
        asyncio.run(review_answer(provider, 'Giao xe chưa?', 'Đã giao xe.', DATA))


def test_unsupported_non_numeric_status_is_repaired_then_fails_closed():
    provider = AsyncMock()
    provider._chat.side_effect = [
        {'answer': 'Đã giao xe.'}, {'supported': False, 'contextIds': [], 'reason': 'Actual delivery not verified'},
        {'answer': 'Đã giao xe.'}, {'supported': False, 'contextIds': [], 'reason': 'Actual delivery not verified'}]
    with patch('app.infrastructure.ai.natural_answers.BedrockProvider', return_value=provider):
        with pytest.raises(HTTPException) as error:
            asyncio.run(compose_grounded('Nhận xe chưa?', {'status': 'needs_clarification', 'retrievedAnswer': 'Chưa có dữ liệu đơn.'}))
    assert error.value.status_code == 503
    assert provider._chat.await_count == 4


def test_clarification_never_inherits_grounded_from_earlier_facts():
    provider = AsyncMock()
    provider._chat.return_value = {'supported': True, 'contextIds': [], 'reason': 'Clarification only'}
    final = asyncio.run(review_answer(provider, 'xe nào?', 'Bạn muốn hỏi mẫu xe nào?', {'status': 'needs_clarification'}))
    assert not final['grounded'] and final['citations'] == []
    assert provider._chat.call_args.args[1]['properties']['contextIds']['maxItems'] == 0


def test_csharp_camel_case_sections_preserve_order_source_and_partial_status():
    evidence, citations, status = canonical_sources({'orderCode': 'AW-OWNED', 'sections': [
        {'topic': 'delivery', 'content': 'Lịch chưa xác nhận', 'resultStatus': 'missing', 'detailUrl': '/account/orders/owned'}]})
    assert status == 'partial'
    assert evidence[0].metadata['orderCode'] == 'AW-OWNED'
    assert citations[0].source_detail_path == '/account/orders/owned'


def test_chat_response_uses_only_final_verdict_and_does_not_copy_draft_grounding(client):
    verdict = {'answer': 'Cần xác minh thêm.', 'grounded': False, 'status': 'partial',
               'evidence': [], 'citations': [], 'generationMode': 'bedrock-natural'}
    with patch('app.routers.chat.compose_grounded', AsyncMock(return_value=verdict)):
        response = client.post('/api/chat', json={'question': 'Giá CRV'})
    assert response.status_code == 200
    final = response.json()
    assert final['contexts']  # Retrieval succeeded, but cannot overwrite the final verdict.
    assert not final['grounded'] and final['citations'] == [] and final['evidence'] == []
    assert final['status'] == 'partial'
    assert final['retrievedContextIds']  # Independent of the final evidence subset.


def test_server_qualifiers_are_audited_and_cannot_hide_an_unsupported_claim():
    provider = AsyncMock()
    qualifier = 'Ford EcoSport: từng phân phối chính hãng; chưa xác nhận đang bán.'
    provider._chat.side_effect = [
        {'answer': 'Ford EcoSport đang bán.'},
        {'supported': False, 'contextIds': [], 'reason': 'Contradicts historical market status'},
        {'answer': 'Ford EcoSport đang bán.'},
        {'supported': False, 'contextIds': [], 'reason': 'Contradicts historical market status'}]
    with patch('app.infrastructure.ai.natural_answers.BedrockProvider', return_value=provider):
        with pytest.raises(HTTPException):
            asyncio.run(compose_grounded('Tìm xe', {'requiredQualifiers': [qualifier]}))
    import json
    audited = json.loads(provider._chat.call_args_list[1].args[0][1]['content'])
    assert qualifier in audited['answer']
    assert 'đang bán' in audited['answer']


def test_missing_source_qualifiers_are_attached_before_semantic_review():
    provider = AsyncMock()
    qualifier = 'Đây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.'
    provider._chat.side_effect = [
        {'answer': 'Honda HR-V giá 699.000.000 VND.'},
        {'supported': True, 'contextIds': ['hrv:price'], 'reason': 'Supported with source limitations'}]
    with patch('app.infrastructure.ai.natural_answers.BedrockProvider', return_value=provider):
        final = asyncio.run(compose_grounded('Giá HR-V?', {**DATA, 'requiredQualifiers': [qualifier, qualifier]}))
    assert final['answer'].count(qualifier) == 1
    assert final['grounded']


def test_verified_dealer_website_is_allowed_but_changed_host_or_path_is_rejected():
    data = {'evidence': [{'section': 'dealer', 'metadata': {'facts': {
        'website': {'value': 'http://www.toyota-ansuong.vn/', 'sourceId': 'dealer-source'}}}}]}
    assert validate_answer('Website: http://www.toyota-ansuong.vn/.', data)
    assert validate_answer('[Website](http://www.toyota-ansuong.vn/)', data)
    assert validate_answer('Website: www.toyota-ansuong.vn', data)
    for answer in ['Website: https://fake-dealer.example',
                   'Website: http://www.toyota-ansuong.vn/payment',
                   'Website: www.fake-dealer.example']:
        with pytest.raises(ValueError, match='verified dealer website'):
            validate_answer(answer, data)
    with pytest.raises(ValueError):
        validate_answer('Website: http://www.toyota-ansuong.vn/', {})


def test_server_computes_iso_price_date_comparison_for_semantic_audit():
    provider = AsyncMock()
    provider._chat.side_effect = [{'answer': 'Cần xác nhận thêm.'},
        {'supported': True, 'contextIds': [], 'reason': 'Clarification only'}]
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone.utc).date()
    data = {'status': 'needs_clarification', 'cars': [
        {'carId': 'past', 'displayName': 'Past car', 'priceAsOf': (today - timedelta(days=10)).isoformat()},
        {'carId': 'future', 'displayName': 'Future car', 'priceAsOf': (today + timedelta(days=10)).isoformat()}]}
    with patch('app.infrastructure.ai.natural_answers.BedrockProvider', return_value=provider):
        asyncio.run(compose_grounded('Ngày giá?', data))
    import json
    audited = json.loads(provider._chat.call_args_list[1].args[0][1]['content'])['verifiedData']
    assert [(d['ageDays'], d['isFuture']) for d in audited['verifiedPriceDates']] == [(10, False), (-10, True)]
    assert 'verifiedPriceDates' not in data
