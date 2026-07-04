/**
 * tools/index.ts — the S4 headless tool set (3 of the runner's 10 tools).
 *
 * Wires the pure router + the in-memory availability mirror into the three
 * headless MCP tools: `healthcheck_providers`, `advise_routing`,
 * `get_quota`. The remaining 6 (bootstrap, invoke, advise_spend,
 * format_handoff, list_models, set_provider_state, cancel_invocation) land
 * in S5–S7.
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
import { buildGetQuotaRegistration } from './get-quota.tool';
import { buildHealthcheckProvidersRegistration } from './healthcheck-providers.tool';

export { buildAdviseRoutingRegistration } from './advise-routing.tool';
export type { IAdviseRoutingToolOptions } from './advise-routing.tool';
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
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
	readonly loopDetector?: ILoopDetectionSeam | undefined;
}

/** The 3 headless tools this slice ships, in registration order. */
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
];
