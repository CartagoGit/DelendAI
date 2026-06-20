/**
 * Public surface of `@mcp-vertex/notification`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the watcher + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	readInFlight,
	diffReleased,
	createReleaseWatcher,
} from '../lib/watcher';
export type { IReleasedClaim, IReleaseWatcher } from '../lib/watcher';
export { buildNotifyRegistration } from '../lib/tools';
export type { INotifyToolOptions } from '../lib/tools';
export { watchAgentHeartbeat } from '../lib/agent-events';
export type {
	IAgentEvent,
	IAgentEventKind,
	IAgentHeartbeatWatcher,
	IWatchAgentHeartbeatOptions,
} from '../lib/agent-events';
export { startAgentEventsBridge } from '../lib/agent-events-bridge';
export type {
	IAgentEventsBridge,
	IAgentEventsBridgeOptions,
} from '../lib/agent-events-bridge';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
