"""Compatibility entry point for the unified, pending-review holdout authoring job.

Replaces the old synthetic reviewer labels, in-index inputs and nonexistent OOD
placeholders. The canonical schema and Q101–Q150 are shared with the submission set.
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from eval.build_submission_ground_truth import main

if __name__ == '__main__':
    main()
