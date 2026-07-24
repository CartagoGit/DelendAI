/**
 * discover-roster.ts — the discovery service.
 *
 * SRP: turns "what CLIs are on PATH + what API keys are in the env" into one
 * `IDiscoveredRoster`. Pure over the injected `IDiscoveryDeps` (DIP) — no
 * `node:*`, no `process.env`, no clock — so every branch is deterministic in
 * tests and the same code runs in the server, the CLI and a future webview.
 */
import {
	KNOWN_APIS,
	KNOWN_CLIS,
	type IKnownApi,
	type IKnownCli,
} from '../contracts/constants/known-providers.constant';
import type {
	IDiscoveredRoster,
	IDiscoveryDeps,
	IMissingProvider,
	IProviderCandidate,
} from '../contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from './roster-store';

/** The first env var in `api.envVars` that holds a non-empty value, or undefined. */
const presentEnvVar = (
	api: IKnownApi,
	env: IDiscoveryDeps['env'],
): string | undefined =>
	api.envVars.find((name) => {
		const value = env[name];
		return typeof value === 'string' && value.trim().length > 0;
	});

const cliCandidate = (cli: IKnownCli): IProviderCandidate => ({
	id: cli.id,
	label: cli.label,
	source: 'cli',
	vendor: cli.vendor,
	reach: cli.command,
	costTier: cli.costTier,
});

const apiCandidate = (api: IKnownApi, envVar: string): IProviderCandidate => ({
	id: api.id,
	label: api.label,
	source: 'api',
	vendor: api.vendor,
	reach: envVar,
	costTier: api.costTier,
});

/** Cheapest-first, then by id so the ordering is stable and reproducible. */
const byCostThenId = (a: IProviderCandidate, b: IProviderCandidate): number =>
	a.costTier - b.costTier || a.id.localeCompare(b.id);

/**
 * Discover every reachable provider (CLI on PATH + API key in env) plus the
 * known-but-missing ones with a one-line fix each. Never throws: a probe
 * that rejects is treated as "not installed".
 */
export const discoverRoster = async (
	deps: IDiscoveryDeps,
): Promise<IDiscoveredRoster> => {
	const available: IProviderCandidate[] = [];
	const missing: IMissingProvider[] = [];

	// CLIs — probe PATH in parallel, tolerating a rejecting probe.
	const cliPresence = await Promise.all(
		KNOWN_CLIS.map(async (cli) => ({
			cli,
			present: await deps.commandExists(cli.command).catch(() => false),
		})),
	);
	for (const { cli, present } of cliPresence) {
		if (present) {
			available.push(cliCandidate(cli));
		} else {
			missing.push({
				id: cli.id,
				label: cli.label,
				source: 'cli',
				reason: `\`${cli.command}\` is not on PATH`,
				hint: cli.installHint,
			});
		}
	}

	// APIs — presence of a key in the env.
	for (const api of KNOWN_APIS) {
		const envVar = presentEnvVar(api, deps.env);
		if (envVar !== undefined) {
			available.push(apiCandidate(api, envVar));
		} else {
			missing.push({
				id: api.id,
				label: api.label,
				source: 'api',
				reason: `no key in ${api.envVars.join(' / ')}`,
				hint: `export ${api.envVars[0]}=…`,
			});
		}
	}

	return {
		available: [...available].sort(byCostThenId),
		missing,
	};
};

/**
 * Discover the live roster and persist a safe snapshot for first-use setup.
 *
 * The snapshot is observability/configuration state, not a cache used for
 * routing: every request still probes the live PATH and environment so a new
 * CLI or API key is available immediately.
 */
export const discoverAndPersistRoster = async (
	deps: IDiscoveryDeps,
	store: IRosterSnapshotStore | undefined,
): Promise<IDiscoveredRoster> => {
	const roster = await discoverRoster(deps);
	if (store !== undefined) await store.save(roster);
	return roster;
};
