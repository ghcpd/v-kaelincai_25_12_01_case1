# Project_B_PostChange: v2 action label extractor

This project contains a greenfield replacement for the `getActionLabel` logic from the legacy `issue_project`.

What it provides:
- `getActionLabelV2`: async, resilient extractor handling `target`, `srcElement`, `currentTarget`
- Idempotency support via requestId
- External normalization support with timeouts and circuit-breaker awareness
- Structured JSON logging and small state machine

Run the tests:

```powershell
cd oswe-mini-prime\Project_B_PostChange
node --version
npm install
npm test
```
