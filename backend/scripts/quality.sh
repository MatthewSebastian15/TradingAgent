#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

python -m ruff format --check .
python -m ruff check .
python -m pytest tests -q
