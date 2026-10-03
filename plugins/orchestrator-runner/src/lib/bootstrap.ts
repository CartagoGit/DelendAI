/**
 * bootstrap.ts — the discovery layer for the bootstrap wizard (f00067 S5).
 *
 * Pure + I/O-boundary helpers behind `<prefix>_discover_providers` and
 * `<prefix>_bootstrap_providers`. Per the wizard flow in
 * `wiki/06-bootstrap-and-quotas.md` §3:
 *
 *   1. PATH probe (`command -v`) for every known provider CLI, in PARALLEL.
 *   2. best-effort auth/status RPC per DETECTED tool to learn its tier.
 *   3. write `${cacheDir}/orchestrator-runner/roster.draft.json` (a DRAFT,
 *      never the confirmed config) durably.
 *   4. build an RFC 6902 JSON Patch (CRITICAL I13) the caller applies — via
 *      MCP elicitation / a CLI prompt — to `delendai.config.json#providers`
 *      on user confirm. The wizard NEVER writes the confirmed config itself:
 *      confirmed intent is the user's to own (the trust gradient, §1).
 *
 * Re-running is non-destructive: the patch only ADDS providers whose `id`
 * is not already in the confirmed `providers` block.
 */
import { readFile } from 'node:fs/promises';

import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
	type IProviderCapabilities,
} from '@delendai/core/public';

import { probeCli, type ProbeRunner } from './healthcheck/probe';
import { installHintFor } from './healthcheck/install-hints';
import type { IInstallHint } from './types';

/**
 * The provider CLIs the wizard probes for, in a stable order. The `id` of a
 * discovered provider is its CLI command name; `installHintFor` is keyed by
 * the same command (so a missing CLI carries its install guidance).
 */
export const DISCOVERABLE_CLIS = [
	'claude',
	'codex',
	'copilot',
	'aider',
	'cn',
	'agent',
] as const;

export type DiscoverableCli = (typeof DISCOVERABLE_CLIS)[number];

/** A provider CLI found on PATH. `authTier` is filled by the auth RPC step. */
export interface IDiscoveredProvider {
	readonly id: string;
	readonly cliPath: string | null;
	readonly version: string | null;
	readonly authTier: string | null;
}

/** A provider CLI NOT on PATH, with structured install guidance (I4). */
export interface IMissingProvider {
	readonly id: string;
	readonly installHint: IInstallHint;
}

/** The result of the PATH probe. */
export interface IDiscoveryResult {
	readonly detected: readonly IDiscoveredProvider[];
	readonly missing: readonly IMissingProvider[];
}

/**
 * Probe every known provider CLI on PATH in PARALLEL (`command -v`). A found
 * CLI becomes a `detected` entry (its `authTier` still `null` — discovery is
 * PATH-only); a missing one becomes a `missing` entry with its install hint.
 */
export const discoverProviders = async (
	runner: ProbeRunner,
	cwd: string,
): Promise<IDiscoveryResult> => {
	const probed = await Promise.all(
		DISCOVERABLE_CLIS.map(async (command) => ({
			command,
			probe: await probeCli(command, runner, cwd),
		})),
	);

	const detected: IDiscoveredProvider[] = [];
	const missing: IMissingProvider[] = [];
	for (const { command, probe } of probed) {
		if (probe.installed) {
			detected.push({
				id: command,
				cliPath: probe.path,
				version: probe.version,
				authTier: null,
			});
		} else {
			missing.push({ id: command, installHint: installHintFor(command) });
		}
	}
	return { detected, missing };
};

/** The best-effort auth/status command per CLI (§4 source 2). */
const AUTH_STATUS_CMD: Readonly<Record<string, string>> = {
	claude: 'claude auth status',
	codex: 'codex login status',
	copilot: 'copilot auth status',
	aider: 'aider --version',
	cn: 'cn auth status',
	agent: 'agent status',
};

/** Subscription tier keywords, longest/most-specific first for a clean match. */
const TIER_KEYWORDS = [
	'Enterprise',
	'Business',
	'Team',
	'Max',
	'Pro',
	'Plus',
	'Free',
] as const;

/**
 * Best-effort tier parse from an auth-status output. Case-insensitive match
 * against a small keyword table; returns the canonical keyword or `null`
 * (never throws). Kept pure so it is trivially testable.
 */
export const parseAuthTier = (output: string): string | null => {
	for (const tier of TIER_KEYWORDS) {
		const re = new RegExp(`\\b${tier}\\b`, 'i');
		if (re.test(output)) return tier;
	}
	return null;
};

/**
 * Run the best-effort auth RPC for a detected CLI and return its tier, or
 * `null` on any failure (no known command, non-zero exit, throw). This is
 * intentionally cheap and forgiving — a missing tier must never fail the
 * wizard.
 */
export const probeAuthTier = async (
	id: string,
	runner: ProbeRunner,
	cwd: string,
): Promise<string | null> => {
	const command = AUTH_STATUS_CMD[id];
	if (command === undefined) return null;
	try {
		const result = await runner(command, { cwd, timeoutMs: 5000 });
		if (result.code !== 0) return null;
		return parseAuthTier(result.output);
	} catch {
		return null;
	}
};

/** The draft schema tag written to `roster.draft.json`. */
export const ROSTER_DRAFT_SCHEMA =
	'delendai/orchestrator-runner/roster-draft/1' as const;

/** The auto-discovered roster draft (cache-only; never the confirmed config). */
export interface IRosterDraft {
	readonly schema: typeof ROSTER_DRAFT_SCHEMA;
	readonly updatedAt: string;
	readonly detected: readonly IDiscoveredProvider[];
	readonly missing: readonly IMissingProvider[];
}

/** Assemble a timestamped roster draft from a discovery result. */
export const buildRosterDraft = (
	discovery: IDiscoveryResult,
	now: Date = new Date(),
): IRosterDraft => ({
	schema: ROSTER_DRAFT_SCHEMA,
	updatedAt: now.toISOString(),
	detected: discovery.detected,
	missing: discovery.missing,
});

/**
 * Write the roster draft durably: `withFileMutex` → `redactSecrets` →
 * `writeFileAtomic`. It is a DRAFT in the cache — the user reviews the
 * derived config patch before anything touches the confirmed config.
 */
export const writeRosterDraft = async (
	absPath: string,
	draft: IRosterDraft,
): Promise<void> => {
	const redacted = redactSecrets(JSON.stringify(draft, null, '\t'));
	await withFileMutex(absPath, async () => {
		await writeFileAtomic(absPath, `${redacted.text}\n`);
	});
};

/** A single RFC 6902 JSON Patch `add` operation (CRITICAL I13). */
export interface IJsonPatchOp {
	readonly op: 'add';
	readonly path: string;
	readonly value: unknown;
}

/**
 * Read the confirmed config's `providers` array from disk, tolerating a
 * missing/corrupt file (fresh workspace) by returning `null` (meaning "no
 * `/providers` key yet"). Never throws — a config miss must not fail the
 * wizard.
 */
export const readConfirmedProviders = async (
	configPath: string,
): Promise<readonly { readonly id?: unknown }[] | null> => {
	let raw: string;
	try {
		raw = await readFile(configPath, 'utf8');
	} catch {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as { providers?: unknown };
		if (Array.isArray(parsed.providers)) {
			return parsed.providers as readonly { id?: unknown }[];
		}
		return null;
	} catch {
		return null;
	}
};

/**
 * Build the draft `IProviderCapabilities` entry for a discovered CLI. The
 * concrete `modelId`/`costTier`/capabilities are placeholders the user
 * refines — the wizard only knows the CLI exists, not which model it should
 * front. Kept a well-typed core contract shape so the patch value is valid.
 */
export const draftProviderEntry = (
	discovered: IDiscoveredProvider,
): IProviderCapabilities => ({
	id: discovered.id,
	kind: 'cli',
	invoke: { kind: 'cli', command: discovered.id },
	modelId: 'PLEASE-SET-MODEL-ID',
	contextWindow: 0,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

/**
 * Build the RFC 6902 JSON Patch (CRITICAL I13) that copies newly-discovered
 * providers into `delendai.config.json#providers` on user confirm.
 *
 * - If the confirmed config has no `/providers` array yet, the first op
 *   creates it (`{op:'add', path:'/providers', value:[]}`).
 * - Each discovered provider whose `id` is NOT already confirmed is appended
 *   (`{op:'add', path:'/providers/-', value:<entry>}`). Existing ids are
 *   left untouched — re-running the wizard is non-destructive (§3).
 *
 * The patch is RETURNED to the caller; the wizard never applies it itself.
 */
export const buildProvidersPatch = (
	confirmedProviders: readonly { readonly id?: unknown }[] | null,
	detected: readonly IDiscoveredProvider[],
): readonly IJsonPatchOp[] => {
	const ops: IJsonPatchOp[] = [];
	if (confirmedProviders === null) {
		ops.push({ op: 'add', path: '/providers', value: [] });
	}
	const existingIds = new Set(
		(confirmedProviders ?? [])
			.map((entry) => entry.id)
			.filter((id): id is string => typeof id === 'string'),
	);
	for (const provider of detected) {
		if (existingIds.has(provider.id)) continue;
		ops.push({
			op: 'add',
			path: '/providers/-',
			value: draftProviderEntry(provider),
		});
	}
	return ops;
};

/**
 * Compose the prose brief the wizard returns to the LLM (§3). It summarizes
 * what was detected/missing and asks the 2-3 cost/task questions the LLM
 * relays to the user in natural language. English at runtime (the MCP SDK
 * contract); the docs site localizes the tool description separately.
 */
export const composeBootstrapBrief = (discovery: IDiscoveryResult): string => {
	const lines: string[] = [];
	if (discovery.detected.length === 0) {
		lines.push(
			'No provider CLIs were found on your PATH. Install one of the listed tools (see `missing[].installHint`) and re-run the wizard.',
		);
	} else {
		const names = discovery.detected
			.map((d) => (d.authTier ? `${d.id} (${d.authTier})` : d.id))
			.join(', ');
		lines.push(
			`Detected ${discovery.detected.length} provider CLI(s): ${names}.`,
		);
	}
	if (discovery.missing.length > 0) {
		lines.push(
			`Not installed: ${discovery.missing.map((m) => m.id).join(', ')}. Each carries an installHint (some pipe a remote script into a shell — flagged dangerous:true).`,
		);
	}
	lines.push(
		'To finish setup, ask the user, in their own language: (1) their spend preference — minimize / balanced / maximize quality; (2) the kinds of tasks they will route here; (3) whether to add any missing tool.',
	);
	lines.push(
		'A DRAFT roster was written to the cache. When the user confirms, apply the returned RFC 6902 JSON Patch to `delendai.config.json#providers` (via elicitation or a CLI prompt) — the wizard never writes the confirmed config itself.',
	);
	return lines.join(' ');
};
