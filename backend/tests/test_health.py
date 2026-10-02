from unittest.mock import AsyncMock, patch


def test_health_healthy(client):
    with patch("app.routers.health.check_db_health", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = True
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["database"] == "ready"


def test_health_unhealthy(client):
    with patch("app.routers.health.check_db_health", new_callable=AsyncMock) as mock_check:
        mock_check.return_value = False
        response = client.get("/api/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == 503
        assert data["detail"] == "PostgreSQL is not ready"
