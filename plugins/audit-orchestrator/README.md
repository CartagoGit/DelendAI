# Audit orchestrator

Project-agnostic plugin to turn a `plan`-type audit proposal into coordinated
work via subagents.

## Flow

1. `audit_plan` or `audit_run` from the audits plugin generates a `plan`-type
   audit and materializes a parent proposal (`type: plan`).
2. `audit_orchestrate_plan` reads that proposal, validates it belongs to the
   workspace, and derives ordered tasks from its `contains.proposals` or
   `## Slices` section.
3. `audit_orchestrate_run` executes those tasks through the dispatch port
   injected by the host, reusing the scheduler, budgets, rotation, and
   lifecycle of the `agent-orchestrator` plugin.

## Security

- `dryRun` defaults to `true`.
- Real execution requires `dryRun: false` and an explicit `dispatchPortFactory`.
- Paths are validated against the workspace; `process.cwd()` is never used.
- The plugin knows nothing about providers, models, credentials, or commands
  of any specific project. The host decides how to create, isolate, cancel,
  and verify each subagent.

## Tools

- `audit_orchestrate_plan { planPath, mode? }`: preview of tasks and dependencies.
- `audit_orchestrate_run { planPath, dryRun?, mode? }`: preview or sequential
  fail-closed execution of the derived tasks.

## Configuration

```jsonc
{
	"plugins": {
		"audit-orchestrator": {
			"options": {
				"dispatchPortFactory": "<host injected factory>"
			}
		}
	}
}
```

The plugin depends on `agent-orchestrator`. In production the host must
inject a real `IDispatchPort`; `allowFakeDispatchPort` must only be used in
fixtures and tests.
