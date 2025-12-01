# Browser Compatibility Bug Demo

This is a deliberately minimal Node.js project that simulates a browser compatibility issue: extracting a `data-action` label from click events works in modern browsers (which expose `event.target`), but fails in older Internet Explorer builds where the information only lives on `event.srcElement`.

## Project layout

```
.
├── README.md
├── KNOWN_ISSUE.md
├── package.json
├── src/
│   └── compatActionLabel.js
└── tests/
    └── compatActionLabel.test.js
```

## How it works

- `src/compatActionLabel.js` exports `getActionLabel(event, attribute)` which should retrieve a semantic label from different event shapes.
- Tests in `tests/compatActionLabel.test.js` emulate Chrome (target-based) vs. IE11 (srcElement-based) click events. The legacy path currently fails.

## Run it

```bash
npm install
npm test
```

`npm test` uses the built-in `node --test` runner, so no extra dev dependencies are required.

## What to look for

Two tests currently fail because the implementation never inspects `event.srcElement`. Updating the function to treat `srcElement` as a fallback target will restore compatibility.
