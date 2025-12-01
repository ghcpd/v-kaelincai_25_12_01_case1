# Appointment Action Extraction - Greenfield Replacement

This repository contains a greenfield replacement design for a legacy `getActionLabel` handler, oriented towards robust, production-grade systems for event-based appointment/UX actions.

Purpose:
- Provide a resilient, idempotent, auditable extractor service for UI events.
- Simulate external normalization service and saga/outbox patterns.
- Provide integration tests and a single-command test harness.

Structure:
- src/: core runtime code (extractor, lifecycle, sagas, circuit-breaker patterns).
- mocks/: external mocked normalization API.
- data/: canonical test cases and expected outputs.
- tests/: integration tests derived from crash points/risks.
- logs/: captured logs for runs.
- results/: aggregated test results.

See `design_and_analysis.md` for architecture details, RCA, migration and acceptance criteria.

Run tests:

Windows PowerShell:

./run_tests.ps1

Running via `node --test` with built-in Node test runner.

