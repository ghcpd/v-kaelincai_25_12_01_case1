# Known Issue

- **Type**: Browser compatibility regression.
- **Impact**: Click handlers relying on `getActionLabel` fail in Internet Explorer 11 / legacy Edge, so shortcut buttons do nothing.
- **Root cause**: `getActionLabel` only inspects `event.target` / `event.currentTarget` and ignores `event.srcElement`.
- **Fix idea**: Determine the target via `event.target || event.srcElement || event.currentTarget` before reading attributes/dataset.
- **Tests needed**: Keep the existing failing tests; they should pass once the fallback is implemented.
