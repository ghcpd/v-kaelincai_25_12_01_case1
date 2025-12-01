# Structured Logging Schema

Fields:
- event_id: string (UUID)
- timestamp: ISO8601 string
- level: one of info/warn/error/debug
- service: string (e.g., appointment-service)
- request_id / appointment_id: string
- op: string (create|update|publish|compensate)
- payload: object (sensitive fields redacted)
- error: { message, code, stack } (optional)

Sensitive fields: mask tokens, secrets, SSNs, credit card numbers.

Example:
```
{ "event_id": "uuid-123", "timestamp": "2025-12-01T12:10:00Z", "level": "info", "service": "appointment-service", "request_id": "req-1", "op": "create", "payload": { "customer": { "id": "c-1" } } }
```
