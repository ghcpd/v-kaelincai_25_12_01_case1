# API Schema: UI Event Extractor (v1)

## POST /v1/label

Request:
{
  "requestId": "<optional-guid>",
  "event": { /* event-like object as in DOM event */ },
  "attribute": "data-action",
  "metadata": { "client": "web-app", "origin": "xyz" }
}

Response:
{
  "requestId": "<guid>",
  "label": "<normalized|raw label>",
  "normalized": true|false,
  "elapsedMs": 123
}

Field constraints:
- requestId: optional guid string; if missing server will return a new requestId.
- attribute: ASCII string, 1..100 chars; default `data-action`.
- label: 0..256 chars; trimmed.

Errors:
- 400: invalid payload
- 429: rate limit
- 500: internal error

Notes:
- All requests must be logged with `requestId` and `event` hash for dedup tracking.
- For security, PII fields in event must be excluded or hashed before logging.
