/**
 * Public barrel for `@mcp-vertex/auto-agent-selector` — the discovery
 * primitives, for hosts/tests that want to reason about the provider roster
 * without registering the plugin.
 */
export { discoverRoster } from '../lib/discovery/discover-roster';
export { realDiscoveryDeps } from '../lib/discovery/real-deps';
export {
	KNOWN_APIS,
	KNOWN_CLIS,
	type IKnownApi,
	type IKnownCli,
} from '../lib/contracts/constants/known-providers.constant';
export type {
	IDiscoveredRoster,
	IDiscoveryDeps,
	IMissingProvider,
	IProviderCandidate,
	ProviderSource,
} from '../lib/contracts/interfaces/roster.interface';
