# Coding Conventions

Rules every AI assistant must follow when modifying this codebase. These are
not preferences, they are existing patterns in the code. Deviating from them
creates inconsistency that makes future changes harder.

---

## Git Commits

Use Conventional Commits format. Every commit message must follow this pattern:

```
<type>(<scope>): <short description>

[optional body]
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `style`

Examples:
```bash
git commit -m "feat(backend): add time horizon validation for 1-3 month range"
git commit -m "fix(frontend): correct SSE reconnect logic in useAnalysisJob"
git commit -m "test(backend): add coverage for IDX ticker normalization edge cases"
git commit -m "chore: update tradingagents-core to 0.2.5"
git commit -m "docs: add Ollama setup guide to setup.md"
```

Always stage specific files, not `git add .`, unless every changed file belongs
to the same logical unit of work.

---

## Python (Backend + Core)

### General Rules
- Python 3.10+ syntax. Use `X | Y` union types, not `Optional[X]` or `Union[X, Y]`.
- Add `from __future__ import annotations` at the top of every new file.
- Type hints on all function signatures. No `Any` unless genuinely unavoidable.
- Docstrings on all public functions and classes. One-line for simple helpers,
  multi-line for anything that has side effects or non-obvious behavior.
- Line length: 120 characters (matches `pyproject.toml` ruff config).

### Imports
- Standard library first, then third-party, then local. Separate groups with a
  blank line.
- Import from `config.py` for all runtime config. Never read `os.environ`
  directly in routes or services.
- Import from `tradingagents.xxx` (not `backend.tradingagents.xxx`).

### Error Handling
- Use custom exception classes from `backend/errors.py`:
  - `BadRequestError` for invalid input (maps to HTTP 400)
  - `NotFoundError` for missing resources (maps to HTTP 404)
  - `RateLimitError` for rate limit exceeded (maps to HTTP 429)
  - `ApiError` for generic backend errors (maps to HTTP 500)
- Never raise bare `Exception`. Always use the right typed error.
- Never let stack traces or internal paths reach the HTTP response.
  The `unhandled_exception_handler` in `main.py` sanitizes them.

### Pydantic Models
- Response models go in `backend/schemas.py`.
- Request/input models go in `backend/routes/validation.py`.
- Always inherit from `ApiSchema` for response models (it sets `extra="allow"`).
- Never set `extra="forbid"` on response models. The pipeline adds fields over time.

### Testing
- Test files go in `backend/tests/` or `backend/tradingagents-core/tests/`.
- Use `pytest` markers: `@pytest.mark.unit`, `@pytest.mark.integration`,
  `@pytest.mark.smoke`.
- Mock external API calls in unit tests. Never call yfinance, Finnhub, or any
  LLM in a unit test.
- Test file naming: `test_<module_name>.py`.

---

## React / Frontend

### Component Rules
- Functional components only. No class components.
- Every component that accepts props must declare `PropTypes`. No exceptions.
  ```jsx
  import PropTypes from 'prop-types';
  MyComponent.propTypes = { value: PropTypes.string.isRequired };
  ```
- Hooks must start with `use`. Custom hooks go in `frontend/src/hooks/`.
- No inline styles. Use Tailwind utility classes.
- No hardcoded colors. Use the Bloomberg design token classes from `tailwind.config.js`:
  `bloomberg-bg`, `bloomberg-text`, `bloomberg-accent`, `bloomberg-muted`, etc.

### File Organization
- Page-level components go in `frontend/src/pages/`.
- Shared components go in `frontend/src/components/`.
- Result card sub-components go in `frontend/src/components/results/`.
- Tab components go in `frontend/src/components/results/tabs/`.
- Utilities go in `frontend/src/utils/`.
- Constants (static strings, disclaimers) go in `frontend/src/constants/`.

### Environment Variables
- Always use `VITE_` prefix. Never use `REACT_APP_` prefix.
- Access via `import.meta.env.VITE_XXX`. Never via `process.env`.
- Document every new variable in `frontend/.env.example`.

### Mock Data
- Mock data lives in `frontend/dev/mockData.js` and `frontend/src/utils/mockReport.js`.
- Never import mock data in production components.
- The mock route (`/analysis.test`) is gated by `VITE_ENABLE_MOCK=true`.
- `StockFormMock.jsx` is a dev-only component. Do not import it from production paths.

### API Contract Sync
When `backend/schemas.py` changes, `frontend/src/domain/analysisContract.js`
must be updated to match. These two files must stay in sync. Verify both when
touching the analysis result shape.

### Testing
- Test files sit next to the component: `MyComponent.test.jsx`.
- Use Vitest + Testing Library. No Enzyme.
- Test what the user sees, not implementation details.
- Mock `fetch` and SSE in tests. Never make real network calls in tests.

---

## Environment and Configuration

### `.env` Files
- `backend/.env.example` is the canonical reference for all backend variables.
- `frontend/.env.example` is the canonical reference for all frontend variables.
- Never commit `.env` to git.
- When adding a new variable, add it to both `.env.example` and `decisions.md`.

### Secrets
- API keys go in `.env` only. Never hardcode in source files.
- The `OWNER_SESSION_SECRET` must be a strong random string in production.
  Leave blank for local dev only.

### CORS
- `CORS_ORIGINS` in `.env` controls allowed origins.
- Default dev value: `http://localhost:3000,http://localhost:5173,...`
- `APP_ENV=development` is required for local dev. `APP_ENV=production` restricts
  several behaviors including error detail verbosity.

---

## Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Python files | `snake_case` | `pipeline_runner.py` |
| Python classes | `PascalCase` | `AnalysisRequest` |
| Python functions | `snake_case` | `normalize_ticker` |
| React components | `PascalCase.jsx` | `ResultCard.jsx` |
| React hooks | `camelCase.js` | `useAnalysisJob.js` |
| React utils | `camelCase.js` | `analysisContract.js` |
| CSS classes | Tailwind only | `text-bloomberg-accent` |
| Env vars (backend) | `UPPER_SNAKE_CASE` | `LLM_PROVIDER` |
| Env vars (frontend) | `VITE_UPPER_SNAKE_CASE` | `VITE_API_URL` |

---

## What Not to Do

- Do not add new dependencies without checking if existing ones cover the need.
- Do not add `console.log` or `print` statements in production code paths.
  Use the logging module (backend) or structured log events.
- Do not bypass the validation layer in `routes/validation.py`. All analysis
  requests must pass through `normalize_and_validate_analysis_request`.
- Do not hardcode the backend URL in frontend components. Always use
  `import.meta.env.VITE_API_URL` via `frontend/src/utils/api.js`.
- Do not remove the `disclaimer` from any user-facing output or report.
  TradingAgent is a research tool, not financial advice.
- Do not change the SSE event format without updating both `routes/sse.py`
  and `frontend/src/hooks/useAnalysisJob.js`.
