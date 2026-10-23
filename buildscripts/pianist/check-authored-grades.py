"""Validate every authored G1--G8 source through the existing admission rules.

This reads the committed composition tables; it does not package or regenerate
the bank, require warehouse/output files, or change musical content.
"""
from collections import Counter
import importlib.util
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), DIRECTORY / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


if __name__ == '__main__':
    advanced = load('package-advanced-abc')
    total = 0
    for grade in range(1, 9):
        module = load(f'package-g{grade}-abc') if grade < 5 else advanced
        rows = module.read_scores() if grade < 5 else module.read_scores(grade)
        counts = Counter(row['group'] for row in rows)
        expected = {f'n{size}': 100 for size in (4, 6, 10, 20, 30, 50, 100)}
        if len(rows) != 700 or counts != expected:
            raise ValueError(f'G{grade}: authored inventory mismatch: {dict(counts)}')
        total += len(rows)
        print(f'G{grade}: {len(rows)} authored scores admitted; all 7 length options present')
    print(f'Validated {total} existing authored scores; no bank files written.')
