# Batuta — several accounts, one plugin

Batuta is not a separate product. It is what `orchestrator-runner` does once
the project declares the accounts its providers run on: the same plugin, the
same MCP server, the host you already use. There is no Batuta CLI, app or
daemon.

This page says what works today, what it refuses, and what has not been
proved yet. Read the last section before relying on it for paid work.

## 1. Declare the accounts

Accounts live at the root of `delendai.config.json`, beside `providers`:

```json
{
	"accounts": [
		{
			"accountId": "claude-work",
			"vendor": "anthropic",
			"credentialMode": "official-subscription-login",
			"billingMode": "subscription-included",
			"profileDir": "profiles/claude-work",
			"quotaGroups": ["claude-work-5h", "claude-work-week"],
			"permittedAutomation": true
		},
		{
			"accountId": "openai-key",
			"vendor": "openai",
			"credentialMode": "byok-api-key",
			"billingMode": "pay-as-you-go",
			"credentialEnv": "OPENAI_API_KEY",
			"quotaGroups": ["openai-key-usd"],
			"permittedAutomation": false
		}
	],
	"providers": [
		{
			"id": "opus-work",
			"kind": "cli",
			"invoke": { "kind": "cli", "command": "claude", "args": ["-p"] },
			"modelId": "claude-opus",
			"contextWindow": 200000,
			"costTier": 4,
			"strengths": ["code-edit", "reasoning"],
			"weaknesses": [],
			"accountId": "claude-work"
		}
	]
}
```

- `credentialMode` and `billingMode` are separate on purpose: who holds the
  credential says nothing about how its use is paid.
- `credentialEnv` is the **name** of a variable. A secret never goes in the
  configuration, which is committed.
- `profileDir` is the directory the vendor's own client keeps that account's
  login in (`CLAUDE_CONFIG_DIR` for Claude Code, `CODEX_HOME` for Codex). Log
  in to it once, yourself, with the vendor's official flow.
- `permittedAutomation` is off unless you turn it on.
- An entry without `accountId` predates accounts and still works as before.

`delendai --check` and the start of the server refuse the same things, and
name each one: a duplicate `accountId`, two accounts on one profile
directory, a quota group drawn from by two accounts, and a provider naming an
account that is not declared (or was refused). A provider on a refused
account is left out with it.

## 2. Discovery asks first

`<prefix>_discover_providers` and `<prefix>_bootstrap_providers` run
`command -v`, `--version` and `auth status` on your machine. Under the
default `discovery: "auto-with-consent"` they ask you once, through the
host's MCP elicitation, and remember a yes. A no, or a host that cannot ask,
probes nothing and answers how to set up by questions instead. `manual`
never probes; `off` turns discovery away. Nothing an agent passes as an
argument counts as your answer.

## 3. What a worker sees

A CLI on an account starts with an allowlist environment: `PATH`, your
unreplaced `HOME`, locale and temporary directories, the account's own
credential variable when it names one, and the variable that points its
client at the account's profile directory. No other key the server holds
reaches it, so an API key in the server's environment cannot take over a
subscription login.

Refused before anything starts: an account not in the registry, one with
`permittedAutomation: false`, `claude --bare` on a subscription login (it
ignores the login), a profile directory for a client with no known profile
variable, and a credential variable that is not set.

## 4. Quotas and spend

Before a hop on an account, the runner reserves room in every quota group
the account declares, in a ledger shared by every process on the machine.
Two workers cannot both take the last request. A reservation expires on its
own and is released when the hop ends.

A pool with no observation, an observation too old to trust, a window whose
limit or usage is unknown, or a ledger that cannot be read refuses the hop:
unknown is never unlimited. An account with no quota group is refused,
because its spend cannot be bounded.

With `confirmBeforeExecute` on (the default) a hop that may spend asks you
through the host's elicitation, naming the provider and its cost tier. Only
your yes lets it run.

## 5. What happened

Every hop is journalled in the plugin cache: `running`, then `completed` or
`failed` with its reason, or `blocked` when its quota refused it. A hop whose
process died reads `interrupted` at the next start. `completed` means the
provider's process ended without error — never that the task is done.

`<prefix>_accounts` shows each account: modes, isolation, whether unattended
work may use it, the invocations holding each pool now and the last hop. It
never shows a secret or a profile path.

## 6. Not proved yet

These are implemented against simulated processes and fake clients only:

- No real Claude Code, Codex, Copilot, MiniMax or OpenCode invocation has run
  through an account. Each needs your consent and a real account; until one
  has, that combination is not supported, only implemented.
- Nothing writes per-group quota observations yet (response headers,
  remaining-quota endpoints). Without one, an account with quota groups does
  no unattended work — the safe outcome.
- The principal/worker plan, worktree-per-worker execution and resume from a
  checkpoint are not built; the journal is what they will build on.
- The host matrix (Copilot in VS Code, Claude, Codex, OpenCode, remote hosts)
  has not been exercised with real delegation.

The full specification, and the state of each slice, are in proposal f00551.
