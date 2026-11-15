#!/usr/bin/env bash
# Run the tests with coverage, then gate the CRAP score of every function in src/ against crap-baseline.json.
# Coverage itself stays with the 95% statement floor in CI, so crap_gate.py runs with --skip-coverage.
# Extra arguments go to crap_gate.py, so --update-baseline records improvements.
set -euo pipefail

npx jest --coverage --silent || exit 1

# complexity at 0 makes ESLint report every function with its score. Those reports are errors by design, so the
# exit status is ignored and crap_gate.py reads the JSON instead.
npx eslint src --rule '{"complexity": ["error", 0]}' --format json >coverage/eslint-complexity.json || true

uv run --no-project tools/crap_gate.py crap \
  --eslint-json coverage/eslint-complexity.json \
  --istanbul coverage/coverage-final.json \
  --baseline crap-baseline.json --skip-coverage "$@"
