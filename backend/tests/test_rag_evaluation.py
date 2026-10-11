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


def test_http_metrics_use_ranked_retrieval_not_final_answer_sources():
    import httpx
    from eval.run_text_evaluation import evaluate_case
    def respond(request):
        return httpx.Response(200, json=dict(intent='ask_price', status='ok', grounded=True,
            generationMode='bedrock-natural', answer='Answer', retrievedContextIds=['irrelevant', 'relevant'],
            evidence=[{'contextId': 'relevant'}], citations=[]))
    case = dict(id='Q001', split='evaluation', question='Giá?', intent='ask_price', expected_status='ok',
                relevant_context_ids=['relevant'], required_answer_facts=['price'])
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        row = evaluate_case(client, case, 'http://api.test', 'http://image.test')
    assert row['context_precision_at_5'] == 0.5
    assert row['context_recall_at_5'] == 1.0
    assert row['faithfulness'] is None and row['human_review'] == 'pending'


def test_old_api_missing_ranked_retrieval_is_an_error_not_a_substitution():
    import httpx
    from eval.run_text_evaluation import evaluate_case
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={'evidence': []}))) as client:
        row = evaluate_case(client, dict(id='Q001', split='evaluation', question='Giá?'), 'http://api.test', 'http://image.test')
    assert row['error'] == 'KeyError'
    assert row['context_precision_at_5'] is None


def test_submission_cases_have_no_missing_images_or_fake_review():
    from eval.seed_snapshot import load_seed_snapshot
    from eval.build_submission_ground_truth import build_cases
    from eval.validate_submission_ground_truth import validate
    cars, warranties, dealers, _ = load_seed_snapshot()
    cases = build_cases(cars, warranties, dealers)
    audit = validate(cases)
    assert audit['valid'], audit['errors']
    assert audit['cases'] == 200 and audit['unique_holdout_photos'] == 44
    assert not audit['independent_human_review_complete']


def test_resume_preserves_failure_and_start_time_without_reissuing_case(tmp_path, monkeypatch):
    import hashlib
    import json
    import sys
    from eval import run_text_evaluation as runner
    cases = [dict(id=f'Q00{i}', split='evaluation', question='Test', review_status='pending') for i in (1, 2)]
    gt = tmp_path / 'gt.jsonl'
    gt.write_text('\n'.join(json.dumps(c) for c in cases), encoding='utf-8')
    output = tmp_path / 'results.csv'
    metadata = dict(started_at='2026-10-11T00:00:00+00:00', selected_ids=['Q001', 'Q002'],
                    ground_truth_sha256=hashlib.sha256(gt.read_bytes()).hexdigest())
    runner.save_report([dict(id='Q001', split='evaluation', error='HTTPStatusError')], output, metadata)
    called = []
    def evaluate(client, case, *urls):
        called.append(case['id'])
        return dict(id=case['id'], split='evaluation', error='', response_seconds=1.0)
    monkeypatch.setattr(runner, 'evaluate_case', evaluate)
    monkeypatch.setattr(sys, 'argv', ['evaluation', '--ground-truth', str(gt), '--output', str(output), '--resume'])
    assert runner.main() == 1
    assert called == ['Q002']
    summary = json.loads(output.with_suffix('.summary.json').read_text())
    assert summary['started_at'] == metadata['started_at']
    assert summary['completed_cases'] == 2 and summary['splits']['evaluation']['errors'] == 1


def test_discovery_sql_facts_have_sources_without_changing_ranked_retrieval():
    from eval.seed_snapshot import load_seed_snapshot
    from app.application.rag.contracts import QueryAnalysis, RagFilters, RetrievalResult
    from app.application.rag.documents import build_documents
    from app.application.rag.context_builder import composition_retrieval, build_context
    cars, _, _, sources = load_seed_snapshot()
    selected = [c for c in cars if c.car_id in {'car_29_4', 'car_29_14'}]
    ranked = [next(d.evidence() for d in build_documents(selected, [], []) if d.section == 'overview')]
    result = RetrievalResult(QueryAnalysis(question='Tìm Ford dưới 1,5 tỷ', intent='find_car'),
                             RagFilters(brand='Ford', max_price=1500000000), selected, ranked, sources=sources)
    composition = composition_retrieval(result)
    assert result.evidence == ranked and len(result.evidence) == 1
    prices = [e for e in composition.evidence if e.section == 'price']
    assert {e.car_id for e in prices} == {c.car_id for c in selected}
    assert all(e.metadata['retrievalOrigin'] == 'sql-catalogue' and e.source_ids for e in prices)
    citations = build_context(composition).citations
    assert all(any(c.context_id == e.context_id and c.source_id for c in citations) for e in prices)
    assert len(composition_retrieval(composition).evidence) == len(composition.evidence)
