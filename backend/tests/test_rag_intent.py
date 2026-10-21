import asyncio
import pytest
from tests.rag_fixtures import car


def parse(question, cars=None):
    from app.application.rag.intent import analyze
    return asyncio.run(analyze(question, cars or [car()]))


@pytest.mark.parametrize("question,intent", [
    ("SUV 5 chỗ dưới 800 triệu", "find_car"),
    ("Thông số Honda CR-V", "ask_specification"),
    ("Giá CRV bao nhiêu?", "ask_price"),
    ("Honda bảo hành bao lâu?", "ask_warranty"),
    ("So sánh CRV và CX-5", "compare_cars"),
    ("Đại lý Toyota tại Hà Nội", "find_dealer"),
])
def test_required_intents(question, intent):
    result = parse(question, [car(), car("car_57_7", "Mazda CX-5", ["CX-5"], brand_name="Mazda")])
    assert result.intent == intent


def test_colloquial_price_difference_is_a_comparison():
    result = parse('Mazda CX-5 giá cả khác bao nhiêu với Honda CRV?',
        [car(), car('mazda', 'Mazda CX-5', ['CX-5'], brand_name='Mazda')])
    assert result.intent == 'compare_cars'
    assert set(result.car_ids) == {'car_34_3', 'mazda'}


def test_price_comparison_with_missing_reference_requires_clarification():
    result = parse('Chiếc xe bên trên giá cả khác bao nhiêu với Honda CRV?')
    assert result.intent == 'compare_cars'
    assert result.ambiguities


def test_cheaper_car_search_does_not_require_two_named_models():
    result = parse('Tìm xe rẻ hơn Honda CRV với 7 chỗ')
    assert result.intent == 'find_car'
    assert not any('hai mẫu xe' in message for message in result.ambiguities)


@pytest.mark.parametrize('question', [
    'Bảo hành của Mazda CX-5 và Honda CR-V thế nào?',
    'Giữa Mazda CX-5 và Honda CR-V, ưu tiên giá thấp hơn thì nên cân nhắc chiếc nào?',
])
def test_followup_attributes_keep_both_comparison_subjects(question):
    result = parse(question, [car(), car('mazda', 'Mazda CX-5', ['CX-5'], brand_name='Mazda')])
    assert result.intent == 'compare_cars'
    assert set(result.car_ids) == {'car_34_3', 'mazda'}
    assert not result.ambiguities


def test_ordinary_specification_request_is_not_only_a_data_scope_question():
    from app.application.rag.intent import is_data_scope_question
    assert not is_data_scope_question('Liệt kê thông số Honda CR-V trong dữ liệu cho thị trường Việt Nam')
    assert not is_data_scope_question('Liệt kê thông số Honda CR-V trong dữ liệu và cho biết có đúng với phiên bản Việt Nam không')
    assert is_data_scope_question('Thông số trong dữ liệu có đúng với phiên bản bán tại Việt Nam không?')


@pytest.mark.parametrize("value,expected", [("800 triệu", 800_000_000), ("1 tỷ", 1_000_000_000),
    ("1,2 tỷ", 1_200_000_000), ("1.2 tỷ", 1_200_000_000)])
def test_money_and_strict_upper_bound(value, expected):
    f = parse("Tìm SUV 5 chỗ dưới " + value).filters
    assert f.max_price == expected and f.max_price_inclusive is False
    assert f.seats == 5 and f.body_type == "SUV"


def test_range_and_inclusive_bound():
    f = parse("Tìm xe từ 700 đến 900 triệu, máy dầu số tự động").filters
    assert (f.min_price, f.max_price) == (700_000_000, 900_000_000)
    assert f.fuel_type == "Diesel" and f.transmission == "Automatic"
    assert parse("SUV không quá 1 tỷ").filters.max_price_inclusive is True


@pytest.mark.parametrize("question,expected", [
    ("có xe nào hợp tài chính 900tr và 5 chỗ ngồi không", 900_000_000),
    ("Tìm xe ngân sách 1,2 tỷ 5 chỗ", 1_200_000_000),
    ("Ngân sách 900.000.000 VND 5 chỗ", 900_000_000),
])
def test_affordable_budget_is_an_inclusive_ceiling(question, expected):
    from app.application.rag.intent import matches_filters
    result = parse(question)
    assert result.intent == "find_car"
    assert result.filters.max_price == expected
    assert result.filters.max_price_inclusive
    assert result.filters.seats == 5
    candidate = car().model_copy(update={"seats": 5, "price_vnd_from": expected, "price_source_id": "verified"})
    assert matches_filters(candidate, result.filters)
    assert matches_filters(candidate.model_copy(update={"price_vnd_from": expected - 1}), result.filters)
    assert not matches_filters(candidate.model_copy(update={"price_vnd_from": expected + 1}), result.filters)
    assert not matches_filters(candidate.model_copy(update={"seats": 7}), result.filters)


def test_budget_does_not_override_strict_bound_or_turn_seats_into_money():
    assert not parse("Ngân sách dưới 900 triệu").filters.max_price_inclusive
    assert parse("Ngân sách cho xe 5 chỗ").filters.max_price is None


def test_alias_boundaries_and_longest_match():
    cars = [car("a", "Honda City", ["City"]), car("b", "Honda City Hatchback", ["City Hatchback"])]
    assert parse("Giá Honda City Hatchback", cars).car_ids == ["b"]
    assert parse("electricity", cars).car_ids == []


def test_ambiguous_name_and_missing_comparison():
    cars = [car("a", "Brand A Sport", ["Sport"]), car("b", "Brand B Sport", ["Sport"])]
    assert parse("Giá Sport", cars).ambiguities
    assert parse("So sánh Honda CR-V").ambiguities


def test_conflicting_conditions_and_version_request():
    assert parse("SUV trên 2 tỷ dưới 1 tỷ").ambiguities
    assert parse("Thông số Honda CR-V bản 2025").limitations


def test_city_and_brand():
    result = parse("Đại lý Honda ở TP.HCM")
    assert result.filters.city == "Ho Chi Minh City" and result.filters.brand == "Honda"


def test_grouped_vnd_amount_and_named_model_without_alias():
    assert parse("SUV không quá 1.200.000.000 đồng").filters.max_price == 1200000000
    assert parse("Giá CR-V", [car(aliases=["CRV"], name="Honda CR-V 2023")]).car_ids == ["car_34_3"]


@pytest.mark.parametrize("question", ["CRV có dưới 8 chỗ không?", "CRV công suất dưới 200 hp?", "CRV chạy trên 100000 km?"])
def test_non_price_quantities_are_not_budget_filters(question):
    r = parse(question)
    assert r.filters.max_price is None and r.filters.min_price is None and r.filters.seats is None


def test_model_subject_attributes_are_not_discovery_filters():
    r = parse("CRV dùng máy dầu không?")
    assert r.filters.fuel_type is None and r.intent == "ask_specification"


def test_long_fuel_alias_does_not_conflict_with_nested_petrol_word():
    r = parse("Tìm xe lai xăng điện dưới 1 tỷ")
    assert r.filters.fuel_type == "Hybrid" and not r.ambiguities

@pytest.mark.parametrize("question", ["so sánh tucson và xe hrv", "so sánh tuscon với hr v", "so sánh tucsson và hr-v"])
def test_near_model_names_resolve_both_comparison_subjects(question):
    result = parse(question, [car("t", "Hyundai Tucson", [], brand_name="Hyundai"), car("h", "Honda HR-V", [], brand_name="Honda")])
    assert set(result.car_ids) == {"t", "h"}
    assert result.intent == "compare_cars"
    assert not result.ambiguities


def test_bare_brand_is_not_a_fuzzy_model_and_exact_model_wins():
    cars = [car('m2', 'Mazda2', [], brand_name='Mazda'), car('m3', 'Mazda3', [], brand_name='Mazda'),
            car('m6', 'Mazda6', [], brand_name='Mazda')]
    brand = parse('Tìm xe Mazda dưới 1 tỷ', cars)
    assert brand.car_ids == [] and not brand.ambiguities
    model = parse('Giá Mazda3?', cars)
    assert model.car_ids == ['m3'] and not model.ambiguities


def test_generic_vietnamese_cho_is_not_a_seating_or_car_intent():
    result = parse('Hãy chỉ cho tôi cách làm bánh mì.')
    assert result.intent == 'other' and result.filters.seats is None


def test_saloon_filter_does_not_widen_to_all_brand_models():
    cars = [car('a', 'Honda Accord', [], body_type='Saloon'), car('b', 'Honda CR-V', [], body_type='SUV')]
    result = parse('Tìm xe Honda kiểu Saloon 5 chỗ dưới 2 tỷ.', cars)
    assert result.filters.body_type == 'Saloon'
    from app.application.rag.intent import matches_filters
    assert not matches_filters(cars[1], result.filters)
