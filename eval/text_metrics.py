def retrieval_metrics(retrieved, relevant, k=5):
    ids = list(dict.fromkeys(retrieved))[:k]
    expected = set(relevant)
    if not expected:
        return {"precision": None, "recall": None}
    hits = len(set(ids) & expected)
    return {"precision": hits / len(ids) if ids else 0.0, "recall": hits / len(expected)}
