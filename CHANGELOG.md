# Changelog

All notable changes to this project are documented in this file.

This project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic-style commit categories such as `feat`, `fix`, `refactor`, `docs`, `test`, and `chore`.

## [Unreleased]

### Added
- Added full-stack TradingAgent architecture with FastAPI backend, React/Vite frontend, and TradingAgents core integration.
- Added REST analysis endpoint at `/api/analyze`.
- Added Server-Sent Events analysis endpoint at `/api/analyze/stream`.
- Added real-time agent progress streaming for long-running analysis.
- Added mock analysis mode for frontend-only testing.
- Added structured `PortfolioDecision` output for final analysis results.
- Added yfinance data quality reporting.
- Added actionable trading output fields:
  - Suggested allocation percentage.
  - Entry price.
  - Stop loss.
  - Take profit.
  - Risk level.
  - Confidence score.
- Added support for Indonesian stock tickers using the `.JK` suffix.
- Added multi-provider LLM support.
- Added backend validation tests.
- Added SSE streaming tests.
- Added Docker support for backend and frontend.
- Added Docker Compose setup for full-stack local execution.
- Added startup configuration validation.

### Changed
- Migrated frontend from Create React App style setup to Vite.
- Redesigned frontend UI and UX.
- Improved dashboard layout, analysis form, result cards, and agent progress log.
- Refactored backend analysis flow so REST and SSE endpoints share the same core logic.
- Improved backend reliability, error handling, logging, and rate limiting.
- Improved analysis pipeline performance with parallel analyst execution.
- Improved mock data and result rendering.
- Updated README to match the current project structure, setup steps, and runtime behavior.

### Fixed
- Fixed frontend JSX parsing issues in Vite.
- Fixed frontend/backend response alignment.
- Fixed CORS configuration for local development.
- Fixed backend SSE handling.
- Fixed provider and ticker handling.
- Fixed merge conflicts in the main branch.

### Security
- Improved API-key-aware rate limiting.
- Added safer configuration validation.
- Improved sanitized error responses.
- Reduced risk of exposing sensitive backend details in API errors.

### DevOps
- Added `Dockerfile.backend`.
- Added `Dockerfile.frontend`.
- Added `docker-compose.yml`.
- Added `.dockerignore`.
- Documented local setup without Docker.
- Documented Docker-based setup.

---

## [2026-05-14]

### Added
- Added real SSE progress events for backend analysis.
- Added parallel analyst execution for the early analysis stage.
- Added full-stack Docker support.
- Added yfinance data quality validation.
- Added actionable output fields for trading recommendations.
- Added backend tests for validation and SSE behavior.
- Added Indonesian ticker support with `.JK`.

### Changed
- Cleaned and stabilized the Vite frontend setup.
- Redesigned the frontend UI.
- Migrated frontend tooling to Vite.
- Streamlined backend dependencies.
- Improved README documentation.
- Improved frontend result rendering for richer analysis explanations.
- Improved FastAPI analysis reliability.
- Improved SSE endpoint stability.

### Fixed
- Fixed JSX/Vite parsing errors.
- Fixed missing explanation fields in frontend analysis output.
- Fixed frontend behavior so analysis results can display complete explanation content.
- Fixed backend reliability issues around analysis execution and streaming.
- Fixed LLM provider and ticker handling.

### Tests
- Added backend validation test coverage.
- Added analysis route test coverage.
- Added SSE event test coverage.
- Added rate limiter test coverage.

---

## [2026-05-13]

### Added
- Added structured trading decision output.
- Added SQLite-based memory support.
- Added rate limiting for backend analysis endpoints.
- Added mock testing flow separated from production analysis.
- Added backend architecture improvements for validation and logging.
- Added security and configuration improvements.

### Changed
- Refactored backend analysis pipeline.
- Unified normal JSON analysis and SSE streaming logic.
- Improved backend error handling.
- Improved debate system structure.
- Improved structured output validation.
- Improved frontend alignment with backend analysis API.
- Improved resilience and parallel agent execution.

### Fixed
- Fixed inconsistent behavior between `/api/analyze` and `/api/analyze/stream`.
- Fixed backend error response consistency.
- Fixed frontend mismatch with backend response fields.
- Fixed fragile debate routing logic.
- Fixed unsafe or unclear backend error messages.

### Security
- Improved backend security configuration.
- Improved API key and provider validation.
- Improved rate limiting behavior.
- Improved handling for missing client request information.

---

## [2026-05-12]

### Added
- Added SSE streaming support.
- Added `ProcessPoolExecutor` support for running long analysis jobs.
- Added startup validation.
- Added frontend mock data improvements.
- Added improved UI output for agent analysis results.

### Changed
- Improved backend stability.
- Switched default LLM flow toward Google Gemini.
- Improved integration between backend and LLM provider configuration.

### Fixed
- Fixed backend stability issues.
- Fixed mock result display behavior.
- Fixed frontend output formatting for agent analysis results.

---

## [2026-05-11]

### Added
- Added initial full-stack application structure.
- Added FastAPI backend foundation.
- Added React frontend foundation.
- Added TradingAgents core integration.
- Added initial frontend UI components:
  - Design tokens.
  - Navbar.
  - Dashboard.
  - Stock form.
  - Agent progress log.

### Changed
- Updated backend CORS configuration for local testing.
- Switched default LLM provider to Google Gemini.
- Improved frontend/backend local development compatibility.

### Fixed
- Fixed initial core integration issues.
- Fixed merge conflicts.
- Fixed CORS issues for frontend and backend testing.

---

## Initial Commit

### Added
- Created the initial repository.
- Added the first project foundation.

---

## Major Upgrade Summary

### Backend
- FastAPI wrapper for TradingAgents.
- REST endpoint for analysis.
- SSE endpoint for streaming analysis.
- Startup validation.
- Rate limiting.
- Structured error handling.
- Process pool execution.
- Pipeline timeout handling.
- SQLite memory.
- Input validation.
- Multi-provider LLM support.
- Indonesian ticker support.
- yfinance data quality reporting.
- Actionable trading output.

### Frontend
- React frontend with Vite.
- Dashboard page.
- Analysis page.
- Mock analysis page.
- Not found page.
- Agent live progress log.
- Structured result cards.
- Local analysis history.
- Mock mode for testing without backend.

### AI Pipeline
- Balanced 9-agent analysis flow:
  - Market Analyst.
  - News Researcher.
  - Fundamentals Analyst.
  - Bull Researcher.
  - Bear Researcher.
  - Research Manager.
  - Trader.
  - Risk Analysts.
  - Portfolio Manager.
- Structured debate flow.
- Final `PortfolioDecision` output.
- Real-time progress events through SSE.

### DevOps
- Backend Dockerfile.
- Frontend Dockerfile.
- Docker Compose configuration.
- Local development setup.
- Environment variable documentation.
- Updated README documentation.

---
