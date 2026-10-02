def test_get_cars_list(client):
    response = client.get("/api/cars?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert "items" in data
    assert data["count"] >= 1
    car = data["items"][0]
    assert car["carId"] == "car_honda_crv"
    assert car["brand"] == "Honda"
    assert car["displayName"] == "Honda CR-V 2023"
    assert isinstance(car["aliases"], list)
    assert car["priceVndFrom"] == 1109000000


def test_get_car_by_id_found(client):
    response = client.get("/api/cars/car_honda_crv")
    assert response.status_code == 200
    data = response.json()
    assert data["carId"] == "car_honda_crv"
    assert data["brand"] == "Honda"


def test_get_car_by_id_not_found(client):
    response = client.get("/api/cars/non_existent_id")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
