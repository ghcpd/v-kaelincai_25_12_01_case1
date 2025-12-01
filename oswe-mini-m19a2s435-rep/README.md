# OSWE Mini Greenfield Replacement

This repository presents a minimal, testable greenfield replacement for a legacy appointment and event handling flow. It demonstrates:

- Robust event target resolution (`getActionLabel` supporting `srcElement`).
- Appointment service with idempotency keys, in-memory outbox, and event emission.
- Integration tests for idempotency, retry/backoff, compensation, and audit flows.

Usage

1. Setup: `./setup.sh` (requires node + npm)
2. Run unit tests: `npm run test:unit` or `npm test`
3. Run integration tests: `npm run test:integration` 

Notes: This is a small sample for architecture & testing ideas. For production replace the in-memory store/outbox with durable storage and add security/observability infra.
