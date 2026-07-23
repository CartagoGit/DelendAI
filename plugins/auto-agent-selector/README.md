# @mcp-vertex/auto-agent-selector

Zero-config multi-agent routing for [mcp-vertex](https://github.com/CartagoGit/mcp-vertex).

Add the plugin and it **auto-discovers every LLM/agent the workspace can
reach** — CLIs found on `PATH` (Claude Code, Codex, Copilot, Gemini, Aider)
and APIs whose key is in the environment (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, OpenRouter, Groq,
DeepSeek, Mistral, xAI). No config file to hand-edit; you drive it from
prompts.

## Use

```jsonc
// mcp-vertex.config.json
{
	"plugins": {
		"auto-agent-selector": {
			// optional: 0 = always the strongest model, 10 = always the cheapest
			"options": { "costQualityTradeoff": 7 }
		}
	}
}
```

or ad-hoc: `mcp-vertex --plugins=auto-agent-selector`.

## Tools

- **`auto_status`** — list the providers reachable right now (cheapest-first)
  plus every known one that is missing, each with a single copy-paste command
  to enable it (install a CLI or export a key). Read-only.
- **`auto_recommend`** — rank the reachable providers and recommend the
  best-value one, with a plain-language rationale for every option. Pass
  `costQualityTradeoff` (0 = always the strongest, 10 = the cheapest that
  works) to override the default, and `pin` to force a provider you prefer
  (a reachable pin always ranks first). Advisory — it never spends and never
  overrides your choice.

More tools land as the [f00119](../../docs/mcp-vertex/proposals/ready/f00119-auto-agent-selector-plugin.md)
slices ship: `auto_run` (route → run → gate → escalate up on failure, within
your cost ceiling), and `auto_evaluate` (fold in new/cheaper models,
optionally from live pricing).

## Philosophy

- **Recommend, never dictate.** Cost is a first-class, user-controlled knob;
  a per-task pin always wins over the score.
- **Reuses the routing brain.** Composes `orchestrator-runner` rather than
  re-implementing scoring/invocation.
- **Clean + testable.** All decision logic is pure over injected I/O seams.
