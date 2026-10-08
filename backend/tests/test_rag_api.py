def test_search_additive_contract_and_explicit_new_filters(client):
    response = client.post("/api/search/text", json={"query": "CRV", "minPrice": 1000000000, "fuelType": "Petrol", "transmission": "CVT"})
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] == "ask_specification" and data["evidence"]
    assert "carId" in data["results"][0]
    assert data["filters"]["minPrice"] == 1000000000


def test_chat_has_evidence_and_grounded_template(client):
    response = client.post("/api/chat", json={"question": "Giá CRV"})
    assert response.status_code == 200
    data = response.json()
    assert data["generationMode"] == "bedrock-natural" and data["grounded"]
    assert data["intent"] == "ask_price" and data["citations"]
    assert data["contexts"][0]["carId"]
    assert len({c["carId"] for c in data["contexts"]}) == len(data["contexts"])


def test_whitespace_and_invalid_search_filters(client):
    assert client.post("/api/chat", json={"question": "   "}).status_code == 422
    assert client.post("/api/search/text", json={"query": "xe", "minPrice": -1}).status_code == 422


def test_chat_explicit_filters_and_image_candidate_ids(client):
    data = client.post("/api/chat", json={"question": "Tìm Honda dưới 1 tỷ", "filters": {"maxPrice": 1200000000},
        "carIds": ["car_honda_crv"], "topK": 2}).json()
    assert data["filters"]["maxPrice"] == 1200000000 and data["contexts"]
    empty = client.post("/api/chat", json={"question": "Giá CRV", "carIds": ["missing"]}).json()
    assert empty["status"] == "no_data" and not empty["grounded"]
