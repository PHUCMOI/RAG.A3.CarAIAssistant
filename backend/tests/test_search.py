def test_text_search(client):
    payload = {
        "query": "CR-V",
        "brand": "Honda",
        "bodyType": "SUV",
        "seats": 7,
        "maxPrice": 1200000000,
        "topK": 5,
    }
    response = client.post("/api/search/text", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "CR-V"
    assert data["retrieval"] == "postgresql-structured-search"
    assert len(data["results"]) >= 1
    assert data["results"][0]["brand"] == "Honda"
