/**
 * Public surface of `@cartago-git/mcp-notification`. The default export
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
