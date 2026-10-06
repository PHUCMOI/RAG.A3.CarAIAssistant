from tests.rag_fixtures import car
from app.models.schemas import WarrantyDto


def documents(cars, warranties=None):
    from app.application.rag.documents import build_documents
    return build_documents(cars, warranties or [], [])


def test_stable_ids_and_only_price_changes():
    a = {d.document_id: d for d in documents([car()])}
    b = {d.document_id: d for d in documents([car(price_vnd_from=999_000_000)])}
    assert "car:car_34_3:price:v1" in a
    assert [k for k in a if a[k].content_hash != b[k].content_hash] == ["car:car_34_3:price:v1"]


def test_price_without_source_does_not_become_claim():
    docs = documents([car(price_source_id=None)])
    price = next(d for d in docs if d.section == "price")
    assert "1109000000" not in price.content and not price.metadata["facts"]


def test_nulls_and_specification_provenance():
    docs = documents([car(engine=None, seats=None)])
    spec = next(d for d in docs if d.section == "specifications")
    assert "Chưa có dữ liệu" in spec.content and "DVM-CAR" in spec.content
    assert "src_honda_vn" not in spec.metadata["sourceIds"]


def test_car_warranty_takes_precedence_and_retains_conditions():
    brand = WarrantyDto(warrantyId=1, brandName="Honda", durationMonths=36,
                        distanceLimitKm=100000, sourceId="brand", conditions="whichever limit comes first")
    specific = WarrantyDto(warrantyId=2, carId="car_34_3", durationMonths=60,
                           distanceLimitKm=150000, sourceId="specific", conditions="Confirm eligibility by VIN and sale date.")
    docs = documents([car()], [brand, specific])
    warranty = next(d for d in docs if d.document_id == "warranty:car:car_34_3:v1")
    assert "60" in warranty.content and warranty.source_id == "specific"
    assert "VIN" in warranty.content
