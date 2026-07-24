# @mcp-vertex/test-policy

Declarative **test-writing policy** for agents: the workspace decides
when/whether the LLM writes tests, and every agent sees the same
contract at orientation.

## Modes

| Mode | Contract |
|---|---|
| `tdd` *(default)* | Write the failing test first, prove it red, implement to green, refactor green. |
| `tests-after` | Implement first; cover every changed behaviour before closing the task. |
| `free` | The agent decides — and must state its choice in the summary. |
| `none` | No new tests (spike/prototype mode); the existing suite must still pass. |

Precedence: **runtime override** (`set_test_policy`, durable) >
**host config** (`options.mode`) > **default `tdd`**.

## Tools

- `<prefix>_get_test_policy {}` → `{ mode, source, guidance[], extraGuidance? }` —
  call before implementing any behavioural change.
- `<prefix>_set_test_policy { mode, reason? }` — persist an override
  (survives restarts); `{ clear: true }` drops it. Refuses when the host
  set `allowSetTool: false`.

A knowledge entry (`test-policy`) renders the live policy so hosts that
surface knowledge at orientation get it for free.

## Config

```jsonc
// mcp-vertex.config.json
{
	"plugins": {
		"test-policy": {
			"options": {
				"mode": "tdd", // omit = tdd
				"extraGuidance": "Protocol behaviour additionally needs an e2e.",
				"allowSetTool": true // false = config-only policy
			}
		}
	}
}
```

Load standalone with `mcp-vertex --plugins=test-policy`; it ships in the
`standard` preset (and everything above it) and in `vertex`.

## State

The override lives at `<cacheDir>/test-policy/policy.json`, written via
`withFileMutex` + `writeFileAtomic`; a corrupt file is quarantined aside
and treated as absent.
