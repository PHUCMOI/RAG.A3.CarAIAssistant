from unittest.mock import Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from image_service.app.routers.chat import router
from image_service.app.routers.image_search import get_retriever
from image_service.app.core.image_retriever import ImageRetriever
from PIL import Image
import numpy as np


@pytest.mark.parametrize('body', [
    {'message': 'xe gì?', 'image_url': '/etc/passwd'},
    {'message': 'xe gì?', 'image_url': '/dev/zero'},
    {'message': 'xe gì?', 'image_base64': 'bad*'},
    {'message': 'xe gì?', 'image_base64': ''},
])
def test_reject_paths_and_invalid_base64_before_retrieval(body):
    app = FastAPI()
    app.include_router(router)
    retriever = Mock()
    app.dependency_overrides[get_retriever] = lambda: retriever
    response = TestClient(app).post('/chat', json=body)
    assert response.status_code == 422
    retriever.search.assert_not_called()


def test_near_tied_candidates_remain_uncertain_even_if_only_top_one_requested():
    index = Mock()
    index.size.return_value = 2
    index.search.return_value = [({'car_id': 'one'}, .90), ({'car_id': 'two'}, .899)]
    extractor = Mock()
    extractor.extract.return_value = np.zeros(512)
    with patch.object(ImageRetriever, '_load_cars', return_value={}):
        retriever = ImageRetriever(index=index, feature_extractor=extractor)
    for k in (1, 5):
        result = retriever.search(Image.new('RGB', (2, 2)), top_k=k)
        assert result['uncertain'] is True
        assert result['confidence'] == 'medium'
        assert result['margin'] == .001


def test_reject_oversized_multipart_before_retrieval():
    app = FastAPI()
    app.include_router(router)
    retriever = Mock()
    app.dependency_overrides[get_retriever] = lambda: retriever
    response = TestClient(app).post('/chat', files={'file': ('large.png', b'x' * (10 * 1024 * 1024 + 1), 'image/png')})
    assert response.status_code == 413
    retriever.search.assert_not_called()
