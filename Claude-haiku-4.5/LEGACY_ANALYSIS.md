# 3.2 Background Reconstruction: Legacy System Analysis

## Business Context & Domain

### **Problem Statement**
Interactive web applications need to respond to user clicks by identifying which action was intended. Modern DOM APIs expose the event target clearly; legacy browsers (IE11, Edge <79) use an alternative property (`srcElement`). The current implementation fails on legacy browsers, leaving shortcut buttons non-functional.

### **Core Business Flow**

```
┌─────────────────────────────────────────────────────────────┐
│  User clicks button/element in webpage                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Browser fires 'click' event                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Listener calls getActionLabel(event, 'data-action')        │
│  - Inspects event.target | event.currentTarget              │
│  - Reads 'data-action' attribute via getAttribute/dataset   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                ┌──────┴──────────┐
                │                 │
                ▼                 ▼
        ✓ Action found    ✗ Action NOT found (IE11/Edge)
        (Modern browsers) (Legacy browsers)
                │                 │
                │                 ▼
                │          Return empty string
                │          No semantic label
                │          Button handler skipped
                │
                ▼
        Handler executes action
        (submit, cancel, edit, etc.)
```

### **Capability Boundaries**

| Capability | Current | Status | Notes |
|-----------|---------|--------|-------|
| Modern Browser Detection | `event.target` | Working | Chrome, Firefox, Safari, Edge 79+ |
| Legacy Browser Detection | `event.srcElement` | **Broken** | IE11, Edge <79 |
| Attribute Reading | `getAttribute()` | Working | W3C standard |
| Dataset API | `target.dataset` | Working | Modern browsers only |
| Custom Properties | `target[attribute]` | Working | Fallback for non-standard |
| Error Handling | Throw or silent fail | Silent fail | Returns '' on error |

### **Core Dependencies**

```
compatActionLabel.js (PUBLIC API)
    │
    ├─→ Browser Event Object
    │   ├─ event.target (modern)
    │   ├─ event.srcElement (legacy)
    │   └─ event.currentTarget (fallback)
    │
    ├─→ DOM Element API
    │   ├─ getAttribute() → W3C standard
    │   ├─ dataset → HTML5 standard
    │   └─ Direct property access → Dynamic
    │
    └─→ Calling Code (Frameworks)
        └─ Bootstrap, jQuery, vanilla JS handlers
```

### **Failure Modes & Uncertainties**

| Mode | Current State | Impact | Likelihood |
|------|---------------|--------|-----------|
| `event` is null/undefined | Throws TypeError | Crash | Low (should be caught upstream) |
| `target` is null/undefined | Returns '' | Silent failure | **High in IE11** |
| `target` lacks attributes | Returns '' | Silent failure | Low |
| Nested target (bubbling) | May read parent attr | Wrong action triggered | Medium |
| Multiple event shapes | Inconsistent behavior | Some actions work, some don't | **High** |

### **Known Issues & Root Causes**

**Issue #1: IE11/Legacy Edge Browser Incompatibility**
- **Symptom**: Shortcut buttons do nothing on IE11/Edge <79
- **Root Cause**: `event.target` is undefined; only `event.srcElement` present
- **Evidence**: Test cases `falls back to srcElement in legacy browsers` + `reads dataset from srcElement when target missing` fail
- **Causal Chain**:
  1. IE11 implements older DOM spec (2007)
  2. Uses `srcElement` instead of `target`
  3. Current code only checks `target || currentTarget`
  4. Misses `srcElement` fallback
  5. Returns empty string
  6. Handler receives no semantic label → action skipped

---

## Architectural Boundaries & Service Decomposition

### **Current Architecture (Monolithic)**

```
compatActionLabel.js (Single Module)
│
├─ Exports: getActionLabel(event, attribute)
│
├─ Dependencies:
│  ├─ toDatasetKey(attribute) [internal]
│  └─ Event object (external)
│
└─ Responsibilities:
   ├─ Event introspection
   ├─ Attribute lookup
   ├─ Browser compatibility logic
   └─ Error handling
```

### **Decomposition Opportunities (Greenfield)**

In a greenfield replacement, we can:
1. **Separate concerns**: Event introspection vs. attribute lookup vs. validation
2. **Add layers**: Logging, metrics, circuit-breaker, retry logic
3. **Extend resilience**: Timeout, fallback strategies, graceful degradation
4. **Enable observability**: Request tracking, event fingerprinting, audit logs

---

## Inference from Code Artifacts

### **Inferred Quality Goals**
- Backward compatible (no breaking changes)
- Fast (pure function, no I/O)
- Robust (graceful degradation)
- Testable (unit tests present; TDD mindset)

### **Inferred Deployment Model**
- Library/npm package
- Consumed by multiple frameworks
- Likely large install base (breaking changes high risk)
- Manual testing; no automated E2E

### **Inferred Data Model**
- **Input**: DOM event + attribute name string
- **Output**: Semantic action label (string)
- **No state**: Stateless function
- **No side effects**: No DOM mutations, no logging (yet)

---

## Uncertainties & Hypotheses

| Uncertainty | Hypothesis | Validation Method |
|-------------|-----------|-------------------|
| Real-world event shapes? | IE11 events lack `target`; modern have it | Capture production events in logs |
| Failure frequency? | ~10% of IE11 traffic affected | Query error telemetry |
| User impact? | Buttons non-functional; UX degradation | User session drop-off analysis |
| Downstream consumers? | Bootstrap, jQuery, custom frameworks | Dependency analysis via npm |
| Deployment timeline? | Release cycle; rollback window? | Audit git history, release notes |

