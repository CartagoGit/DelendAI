/**
 * tools/index.ts — the runner's tool set (10 tools: S4 + S5 + S6).
 *
 * Wires the pure router + the in-memory availability mirror into the
 * headless MCP tools `healthcheck_providers`, `advise_routing`, `get_quota`
 * (S4), the discovery-layer wizard tools `discover_providers` and
 * `bootstrap_providers` (S5), and the Option-E execution surface `invoke`,
 * `cancel_invocation`, `format_handoff`, `list_models`, `set_provider_state`
 * (S6). Only `advise_spend` (S7) remains.
 */
import type {
	IProviderCapabilities,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import type { HealthStore } from '../healthcheck/store';
import type { ProbeRunner } from '../healthcheck/probe';
import type { InvocationManager } from '../invoke/manager';
import type { SessionStore } from '../router/session';
import type { CostPreference, ILoopDetectionSeam } from '../types';
import { buildAdviseRoutingRegistration } from './advise-routing.tool';
import { buildBootstrapProvidersRegistration } from './bootstrap.tool';
import { buildCancelInvocationRegistration } from './cancel-invocation.tool';
import { buildDiscoverProvidersRegistration } from './discover.tool';
import { buildFormatHandoffRegistration } from './format-handoff.tool';
import { buildGetQuotaRegistration } from './get-quota.tool';
import { buildHealthcheckProvidersRegistration } from './healthcheck-providers.tool';
import { buildInvokeRegistration } from './invoke.tool';
import { buildListModelsRegistration } from './list-models.tool';
import { buildSetProviderStateRegistration } from './set-provider-state.tool';

export { buildAdviseRoutingRegistration } from './advise-routing.tool';
export type { IAdviseRoutingToolOptions } from './advise-routing.tool';
export { buildBootstrapProvidersRegistration } from './bootstrap.tool';
export type { IBootstrapProvidersToolOptions } from './bootstrap.tool';
export { buildCancelInvocationRegistration } from './cancel-invocation.tool';
export type { ICancelInvocationToolOptions } from './cancel-invocation.tool';
export { buildDiscoverProvidersRegistration } from './discover.tool';
export type { IDiscoverProvidersToolOptions } from './discover.tool';
export { buildFormatHandoffRegistration } from './format-handoff.tool';
export type { IFormatHandoffToolOptions } from './format-handoff.tool';
export { buildGetQuotaRegistration } from './get-quota.tool';
export type { IGetQuotaToolOptions } from './get-quota.tool';
export { buildHealthcheckProvidersRegistration } from './healthcheck-providers.tool';
export type { IHealthcheckToolOptions } from './healthcheck-providers.tool';
export { buildInvokeRegistration } from './invoke.tool';
export type { IInvokeToolOptions } from './invoke.tool';
export { buildListModelsRegistration } from './list-models.tool';
export type { IListModelsToolOptions } from './list-models.tool';
export { buildSetProviderStateRegistration } from './set-provider-state.tool';
export type { ISetProviderStateToolOptions } from './set-provider-state.tool';

export interface IOrchestratorRunnerToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly sessions: SessionStore;
	readonly manager: InvocationManager;
	readonly defaultCostPreference: CostPreference;
	readonly healthcheckPath: string;
	readonly quotasPath: string;
	readonly rosterDraftPath: string;
	readonly configPath: string;
	readonly workspaceRoot: string;
	readonly runner: ProbeRunner;
	readonly loopDetector?: ILoopDetectionSeam | undefined;
}

/** The 10 tools this plugin ships (S4 + S5 + S6), in a stable order. */
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
	buildInvokeRegistration({
		namespacePrefix: options.namespacePrefix,
		manager: options.manager,
	}),
	buildCancelInvocationRegistration({
		namespacePrefix: options.namespacePrefix,
		manager: options.manager,
	}),
	buildFormatHandoffRegistration({
		namespacePrefix: options.namespacePrefix,
	}),
	buildListModelsRegistration({
		namespacePrefix: options.namespacePrefix,
		providers: options.providers,
		health: options.health,
	}),
	buildSetProviderStateRegistration({
		namespacePrefix: options.namespacePrefix,
		health: options.health,
		healthcheckPath: options.healthcheckPath,
	}),
];
