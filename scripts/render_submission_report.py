"""Generate a candid Markdown report from recorded evidence, never invent scores."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]


def main():
    folder = ROOT / 'docs/submission'
    summary = json.loads((folder / 'evidence/live-evaluation.summary.json').read_text(encoding='utf-8'))
    rows = json.loads((folder / 'evidence/live-evaluation.responses.json').read_text(encoding='utf-8'))
    lines = ['# AutoWise — Báo cáo kỹ thuật và đánh giá', '',
        'Bản làm việc tự động từ evidence, cần nhóm đọc, review ground truth và hoàn thiện tên thành viên trước khi nộp.', '',
        '## Bài toán và phạm vi', '',
        'Trợ lý tư vấn ô tô kết hợp dữ liệu có cấu trúc, text RAG và tìm mẫu xe bằng ảnh. '
        'Catalogue gồm 50 model, 215 ảnh seed, 22 đại lý, 9 chính sách bảo hành và 61 nguồn. '
        'Thông số UK không được coi là phiên bản Việt Nam; giá là dữ liệu tham khảo tại ngày ghi nhận.', '',
        '## Kiến trúc', '',
        'React/TypeScript gọi Nginx. Python FastAPI điều phối guest, SQL filtering và lexical/pgvector/E5 retrieval; '
        'image service dùng CLIP ViT-B/32 và FAISS gom ứng viên theo car_id. C# quản lý cookie auth, roles, '
        'đơn hàng, tài khoản, lịch sử hội thoại và attachment thuộc user. Bedrock hiểu câu hỏi, chọn draft, '
        'viết lời trả lời và audit câu cuối. Model không được tự tạo nguồn hoặc lấy dữ liệu đơn từ client.', '',
        '## Phương pháp đánh giá', '',
        '200 nhãn nháp Q001–Q200: 150 text và 50 ảnh/ảnh + text/fixture lỗi. '
        '44 ảnh holdout được kiểm hash không nằm trong training index; ảnh lặp lại không đi qua hai split. '
        'Context precision/recall dùng ranked retrievedContextIds, tách khỏi evidence đã lọc của answer. '
        'Image Recall@1/@5 và MRR đo từ image search top-k. Lỗi HTTP được giữ trong mẫu tổng; '
        'latency của response thành công có denominator riêng. Nhãn chưa review nên số liệu dưới đây là diagnostics, '
        'không phải kết quả nghiệm thu độc lập.', '',
        f"Thời điểm runner ghi UTC: `{summary['started_at']}`. Ground truth SHA256: `{summary['ground_truth_sha256']}`.", '',
        f"Đã chạy {summary['completed_cases']}/{summary['selected_cases']} mẫu. Human review: **pending**.", '',
        '## Kết quả HTTP live — baseline', '',
        '| Split | Mẫu | Lỗi HTTP/runtime | Intent trên success | Status trên success | Context P@5 | Context R@5 | Image R@1 | Image R@5 | Image MRR@5 | Mean latency success |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    def fmt(value):
        return 'N/A' if value is None else f'{value:.4f}'
    for split, s in summary['splits'].items():
        keys = ['intent_correct', 'status_correct', 'context_precision_at_5', 'context_recall_at_5',
                'image_recall_at_1', 'image_recall_at_5', 'image_mrr_at_5', 'response_seconds']
        lines.append('| ' + ' | '.join([split, str(s['cases']), str(s['errors'])] + [fmt(s.get(k)) for k in keys]) + ' |')
    postfix_path = folder / 'evidence/postfix-evaluation.summary.json'
    if postfix_path.exists():
        postfix = json.loads(postfix_path.read_text(encoding='utf-8'))
        lines += ['', '### Kiểm tra sau sửa SQL evidence', '',
            f"Lượt riêng {postfix['completed_cases']}/{postfix['selected_cases']} mẫu; "
            'xem `postfix-evaluation.*` và `postfix-runtime-identity.json`. Lượt baseline phía trên gắn với '
            '`baseline-runtime-identity.json`, giữ nguyên cả Q089 bị 503. Không thay mẫu lỗi bằng kết quả chạy lại.', '',
            '| Split | Mẫu | Lỗi HTTP/runtime | Intent trên success | Status trên success |',
            '|---|---:|---:|---:|---:|']
        for split, s in postfix['splits'].items():
            lines.append(f"| {split} | {s['cases']} | {s['errors']} | {fmt(s['intent_correct'])} | {fmt(s['status_correct'])} |")
    lines += ['', 'Denominator theo metric nằm trong summary JSON. Faithfulness và answer completeness '
              'chưa chấm, không suy ra từ grounded=true. Discovery sử dụng cả SQL catalogue và ranked text contexts: '
              'P/R@5 ở đây chỉ đo text contexts, không đo toàn bộ facts từ SQL. Ví dụ Q005/Q020 có nhiều price contexts '
              'relevant nhưng top-5 gồm cả overview/specifications; câu trả lời vẫn có giá từ SQL. '
              'Phải chấm claims riêng trước khi kết luận chất lượng answer.', '', '## Các lỗi quan sát được', '']
    reference_path = folder / 'evidence/referencefix-evaluation.summary.json'
    if reference_path.exists():
        reference = json.loads(reference_path.read_text(encoding='utf-8'))
        lines += [f"Lượt cuối kiểm tra Q085/Q089/Q152: {reference['completed_cases']}/{reference['selected_cases']} mẫu, "
                  f"{sum(s['errors'] for s in reference['splits'].values())} lỗi. Đây là regression live có phạm vi ba case, "
                  'không phải chạy lại toàn bộ 200 mẫu trên runtime mới. Evidence: `referencefix-evaluation.*`.','']
    release_path = folder / 'evidence/release-evaluation.summary.json'
    if release_path.exists():
        release = json.loads(release_path.read_text(encoding='utf-8'))
        lines += ['### Evaluation trên runtime cuối', '',
            f"Đã ghi {release['completed_cases']}/{release['selected_cases']} mẫu. "
            + ('Lượt đã hoàn tất.' if release['completed_cases'] == release['selected_cases'] else 'Lượt đang chạy, chưa kết luận toàn bộ bộ dữ liệu.'),
            'Evidence: `release-evaluation.*`; runtime: `release-runtime-identity.json`. Giữ baseline và các lượt sửa riêng.', '',
            '| Split | Mẫu | Lỗi | Intent trên success | Status trên success | P@5 | R@5 | Image R@1 | Image R@5 | MRR@5 |',
            '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
        for split, s in release['splits'].items():
            fields = ['intent_correct', 'status_correct', 'context_precision_at_5', 'context_recall_at_5',
                      'image_recall_at_1', 'image_recall_at_5', 'image_mrr_at_5']
            lines.append('| ' + ' | '.join([split, str(s['cases']), str(s['errors'])] + [fmt(s.get(k)) for k in fields]) + ' |')
        release_rows = json.loads((folder / 'evidence/release-evaluation.responses.json').read_text(encoding='utf-8'))
        failed_ids = [r['id'] for r in release_rows if r['error']]
        mismatch_ids = [r['id'] for r in release_rows if r.get('intent_correct') == 0 or r.get('status_correct') == 0]
        lines += ['Lỗi HTTP/runtime release: ' + (', '.join(failed_ids) if failed_ids else 'chưa ghi nhận') + '.',
                  'Sai intent/status theo nhãn nháp: ' + (', '.join(mismatch_ids) if mismatch_ids else 'chưa ghi nhận') + '.']
        lines.append('')
    auditfix_path = folder / 'evidence/auditfix-evaluation.summary.json'
    if auditfix_path.exists():
        auditfix = json.loads(auditfix_path.read_text(encoding='utf-8'))
        auditfix_rows = json.loads((folder / 'evidence/auditfix-evaluation.responses.json').read_text(encoding='utf-8'))
        lines += ['### Kiểm tra sau sửa audit và xác nhận phiên bản', '',
            f"Đã ghi {auditfix['completed_cases']}/{auditfix['selected_cases']} case regression trên "
            '`auditfix-runtime-identity.json`; evidence `auditfix-evaluation.*`. '
            'Lượt này không thay thế kết quả 200 mẫu release hoặc chứng minh toàn bộ runtime mới.',
            'Lỗi: ' + (', '.join(r['id'] for r in auditfix_rows if r['error']) or 'chưa ghi nhận') + '.', '']
    repair_path = folder / 'evidence/reference-repair-evaluation.summary.json'
    if repair_path.exists():
        repair = json.loads(repair_path.read_text(encoding='utf-8'))
        repair_rows = json.loads((folder / 'evidence/reference-repair-evaluation.responses.json').read_text(encoding='utf-8'))
        lines += ['### Kiểm tra sau repair references', '',
            f"Đã ghi {repair['completed_cases']}/{repair['selected_cases']} case; "
            + ('lượt hoàn tất.' if repair['completed_cases'] == repair['selected_cases'] else 'lượt đang chạy.'),
            'Evidence: `reference-repair-evaluation.*`; runtime: `reference-repair-runtime-identity.json`. '
            'Đây là regression có phạm vi, không phải chạy lại toàn bộ 200 mẫu trên bản cuối.',
            'Lỗi: ' + (', '.join(r['id'] for r in repair_rows if r['error']) or 'chưa ghi nhận') + '.', '']
    lines += ['### Các case baseline cần xem lại', '']
    failures = [r for r in rows if r['error'] or r.get('intent_correct') == 0 or r.get('status_correct') == 0 or r.get('image_recall_at_1') == 0]
    for row in failures[:12]:
        lines.append(f"- {row['id']}: error={row['error'] or 'none'}, HTTP={row.get('http_status')}, "
                     f"status_correct={row.get('status_correct')}, image_recall_at_1={row.get('image_recall_at_1')}. "
                     'Xem response/context IDs trong evidence để phân tích, không tự đổi ground truth theo output.')
    lines += ['', '## Cải tiến có kiểm chứng', '',
        'Báo cáo image ablation hiện có ở `image_service/indexes/ablation_study_results.md`: '
        '44 ảnh, cấu hình CLIP + car aggregation ghi Recall@5 86.36%, MRR 0.7735. '
        'Đây là kết quả image retrieval riêng, không đồng nhất với latency hoặc chất lượng chat end-to-end.', '',
        'Bản sửa cuối: gắn qualifiers phía server và audit câu hoàn chỉnh; tách ranked retrieval telemetry; '
        'ưu tiên model match chính xác trước fuzzy để Mazda không khớp nhầm; sửa selector browser; '
        'bỏ placeholders và synthetic reviewer labels khỏi bộ nộp.', '',
        'Kiểm tra tái lập: `fresh-source-database.json` ghi 194 tests backend từ source giải nén '
        'đã kiểm manifest trên PostgreSQL mới. `clean-release-source.json` ghi npm ci/build và C# tests '
        'từ snapshot trước. Đây không phải full new-machine deployment; Python/dependencies host được dùng lại.', '',
        '## Giới hạn và công việc nhóm còn lại', '',
        'Review chéo toàn bộ nhãn và chấm claims/required facts. Kiểm tra giá/phiên bản với nguồn chính thức '
        'nếu trình bày là dữ liệu Việt Nam hiện hành. Slide nháp đã có; cần nhóm hoàn thiện thông tin, '
        'rubric chính thức và recording có thuyết trình. Demo hiện là screenshots với responses HTTP thật; '
        'FFmpeg chưa tải được nên chưa có video. '
        'Không coi kiểm thử fixture là AWS live; không coi seed/index healthy là model healthy. '
        'Chưa kiểm thử tải lớn hoặc triển khai production. Hướng dẫn demo/review ở README của gói nộp.']
    (folder / 'technical-report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(str(folder / 'technical-report.md'))


if __name__ == '__main__':
    main()
