def test_precision_recall_deduplicates_ids_and_empty_ground_truth():
    from eval.text_metrics import retrieval_metrics
    assert retrieval_metrics(["a", "a", "x"], ["a", "b"], k=5) == {"precision": 0.5, "recall": 0.5}
    assert retrieval_metrics([], [], k=5) == {"precision": None, "recall": None}
    assert retrieval_metrics([], ["a"], k=5) == {"precision": 0.0, "recall": 0.0}


def test_seed_snapshot_and_ground_truth_ids_are_valid():
    from eval.seed_snapshot import load_seed_snapshot
    from eval.build_text_ground_truth import build_ground_truth
    cars, warranties, dealers, sources = load_seed_snapshot()
    assert len(cars) == 50 and len(warranties) == 9 and len(dealers) == 22 and len(sources) == 61
    questions = build_ground_truth(cars, warranties, dealers)
    assert len(questions) == 50 and [q["id"] for q in questions] == [f"Q{i:03d}" for i in range(51, 101)]
    from app.application.rag.documents import build_documents
    context_ids = {d.document_id for d in build_documents(cars, warranties, dealers)}
    car_ids = {c.car_id for c in cars}
    assert all(set(q["expected_car_ids"]) <= car_ids for q in questions)
    assert all(set(q["relevant_context_ids"]) <= context_ids for q in questions)
    assert all(q["reviewed_by"] is None and q["review_status"] == "pending" for q in questions)


def test_ground_truth_can_resolve_actual_split_snapshot_ids():
    from eval.seed_snapshot import load_seed_snapshot
    from eval.build_text_ground_truth import build_ground_truth
    from app.application.rag.documents import build_documents
    from app.application.rag.indexing import split_documents
    class Tokenizer:
        def encode(self, text, **kwargs):
            return text.split()
    cars, warranties, dealers, _ = load_seed_snapshot()
    docs = split_documents(build_documents(cars, warranties, dealers), Tokenizer(), 70)
    cases = build_ground_truth(cars, warranties, dealers, index_documents=docs)
    assert all(set(q["relevant_context_ids"]) <= {d.document_id for d in docs} for q in cases)
    assert any(":part:" in cid for q in cases for cid in q["relevant_context_ids"])
