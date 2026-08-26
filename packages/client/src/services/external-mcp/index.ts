/**
 * external-mcp/index.ts — f00193 (Track K / external MCPs).
 *
 * Barrel for the external-MCP control plane. Consumers that need to
 * build a registry + router pull from here:
 *
 *     import {
 *         ExternalMcpRegistry,
 *         selectProvider,
 *         type IExternalMcpProvider,
 *     } from '@mcp-vertex/client/services/external-mcp';
 *
 * Privacy (R1.1): the types re-exported here are the publishable
 * vocabulary of the control plane. Anything that would leak a
 * tool name is computed lazily by the connector, not exposed.
 */

export type {
	ExternalMcpCapability,
	IExternalMcpConnection,
	IExternalMcpCost,
	IExternalMcpHealth,
	IExternalMcpProvider,
	IExternalMcpRefusal,
	IExternalMcpRouterOptions,
	IExternalMcpSelection,
	ExternalMcpTransport,
	ProviderHealthState,
	RedactedProviderId,
} from './types';
export { DEFAULT_ROUTER_WEIGHTS } from './types';

export {
	classifyHealth,
	DEFAULT_DEGRADED_LATENCY_MS,
	DEFAULT_DOWN_LATENCY_MS,
	probeProvider,
	worstOf,
} from './health';
export type { IClassifyHealthOptions } from './health';

export {
	redactProviderId,
	scoreProvider,
	selectProvider,
	selectWithFailover,
} from './router';
export type { IRouterInput, IRouterInputEnvelope } from './router';

export {
	ExternalMcpRegistry,
	formatRegistrySnapshot,
	scoreAll,
	sanitizeProbeReason,
} from './registry';
export type {
	IRegistryOptions,
	IRegisteredProviderSnapshot,
} from './registry';
