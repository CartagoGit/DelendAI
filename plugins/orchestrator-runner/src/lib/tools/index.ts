/**
 * tools/index.ts — the runner's tool set (5 of its 10 tools: S4 + S5).
 *
 * Wires the pure router + the in-memory availability mirror into the
 * headless MCP tools `healthcheck_providers`, `advise_routing`, `get_quota`
 * (S4), plus the discovery-layer wizard tools `discover_providers` and
 * `bootstrap_providers` (S5). The remaining 5 (invoke, advise_spend,
 * format_handoff, list_models, set_provider_state, cancel_invocation) land
 * in S6–S7.
 */
import type {
	IProviderCapabilities,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import type { HealthStore } from '../healthcheck/store';
import type { ProbeRunner } from '../healthcheck/probe';
import type { SessionStore } from '../router/session';
import type { CostPreference, ILoopDetectionSeam } from '../types';
import { buildAdviseRoutingRegistration } from './advise-routing.tool';
import { buildBootstrapProvidersRegistration } from './bootstrap.tool';
import { buildDiscoverProvidersRegistration } from './discover.tool';
import { buildGetQuotaRegistration } from './get-quota.tool';
import { buildHealthcheckProvidersRegistration } from './healthcheck-providers.tool';

export { buildAdviseRoutingRegistration } from './advise-routing.tool';
export type { IAdviseRoutingToolOptions } from './advise-routing.tool';
export { buildBootstrapProvidersRegistration } from './bootstrap.tool';
export type { IBootstrapProvidersToolOptions } from './bootstrap.tool';
export { buildDiscoverProvidersRegistration } from './discover.tool';
export type { IDiscoverProvidersToolOptions } from './discover.tool';
export { buildGetQuotaRegistration } from './get-quota.tool';
export type { IGetQuotaToolOptions } from './get-quota.tool';
export { buildHealthcheckProvidersRegistration } from './healthcheck-providers.tool';
export type { IHealthcheckToolOptions } from './healthcheck-providers.tool';

export interface IOrchestratorRunnerToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly sessions: SessionStore;
	readonly defaultCostPreference: CostPreference;
	readonly healthcheckPath: string;
	readonly quotasPath: string;
	readonly rosterDraftPath: string;
	readonly configPath: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
	readonly loopDetector?: ILoopDetectionSeam | undefined;
}

/** The 5 tools this plugin ships (S4 + S5), in a stable registration order. */
export const buildOrchestratorRunnerToolRegistrations = (
	options: IOrchestratorRunnerToolOptions,
): readonly IToolRegistration[] => [
	buildHealthcheckProvidersRegistration({
		namespacePrefix: options.namespacePrefix,
		providers: options.providers,
		health: options.health,
		healthcheckPath: options.healthcheckPath,
		workspaceRoot: options.workspaceRoot,
		runner: options.runner,
	}),
	buildAdviseRoutingRegistration({
		namespacePrefix: options.namespacePrefix,
		providers: options.providers,
		health: options.health,
		sessions: options.sessions,
		defaultCostPreference: options.defaultCostPreference,
		loopDetector: options.loopDetector,
	}),
	buildGetQuotaRegistration({
		namespacePrefix: options.namespacePrefix,
		quotasPath: options.quotasPath,
	}),
	buildDiscoverProvidersRegistration({
		namespacePrefix: options.namespacePrefix,
		workspaceRoot: options.workspaceRoot,
		runner: options.runner,
	}),
	buildBootstrapProvidersRegistration({
		namespacePrefix: options.namespacePrefix,
		workspaceRoot: options.workspaceRoot,
		rosterDraftPath: options.rosterDraftPath,
		configPath: options.configPath,
		runner: options.runner,
	}),
];
