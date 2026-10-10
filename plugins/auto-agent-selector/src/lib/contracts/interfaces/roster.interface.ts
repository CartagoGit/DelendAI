/**
 * roster.interface.ts — the data contracts for provider discovery.
 *
 * SRP: this file only names shapes; the logic that fills them lives in
 * `discovery/`. Kept separate so the contracts can be imported by tools,
 * tests and future slices (cost, routing, escalation) without pulling in
 * any I/O.
 */

/** How the orchestrator reaches a discovered provider. */
export type ProviderSource = 'cli' | 'api';

/**
 * One provider the user can actually reach right now — either a CLI found
 * on PATH or an API whose key is present in the environment.
 */
export interface IProviderCandidate {
	/** Stable, kebab-case, unique id (e.g. `claude-cli`, `gemini-api`). */
	readonly id: string;
	/** Human label for UIs (e.g. `Claude (CLI)`, `Gemini (API)`). */
	readonly label: string;
	/** How it is reached. */
	readonly source: ProviderSource;
	/**
	 * The provider family (e.g. `anthropic`, `openai`, `google`). Two
	 * candidates can share a vendor (Claude CLI + Anthropic API) — the
	 * router uses this to avoid recommending the same vendor twice.
	 */
	readonly vendor: string;
	/** For `api`: the env var that held the key. For `cli`: the command. */
	readonly reach: string;
	/**
	 * Relative cost, 1 (cheapest) … 5 (most expensive). A first-pass
	 * default from the known-providers catalogue; later slices refine it
	 * from config / live pricing. Never a hard-coded routing decision.
	 */
	readonly costTier: 1 | 2 | 3 | 4 | 5;
}

/** A provider that is known but NOT reachable, with actionable guidance. */
export interface IMissingProvider {
	readonly id: string;
	readonly label: string;
	readonly source: ProviderSource;
	/** Why it is unavailable (no key / not on PATH). */
	readonly reason: string;
	/** A single copy-paste command to make it available (install or export). */
	readonly hint: string;
}

/** The full result of a discovery pass. */
export interface IDiscoveredRoster {
	/** Providers reachable right now, cheapest-first. */
	readonly available: readonly IProviderCandidate[];
	/** Known providers that are not reachable, with a one-line fix each. */
	readonly missing: readonly IMissingProvider[];
}

/**
 * Injectable I/O seams (DIP): discovery never imports `node:*` directly, so
 * every branch is deterministic under test. Production wires `commandExists`
 * to a real `command -v` probe and `env` to `process.env`.
 */
export interface IDiscoveryDeps {
	/** True when `command` resolves on PATH. */
	readonly commandExists: (command: string) => Promise<boolean>;
	/** The environment to read API keys from. */
	readonly env: Readonly<Record<string, string | undefined>>;
}
