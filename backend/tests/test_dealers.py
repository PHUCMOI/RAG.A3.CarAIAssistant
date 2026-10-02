def test_get_dealers_list(client):
    response = client.get("/api/dealers")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "items" in data
    assert data["count"] >= 1
    dealer = data["items"][0]
    assert dealer["name"] == "Honda Tay Ho"
    assert dealer["city"] == "Hanoi"
    assert "Honda" in dealer["supportedBrands"]


def test_get_dealers_with_filter(client):
    response = client.get("/api/dealers?brand=Honda&city=Hanoi")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 1
