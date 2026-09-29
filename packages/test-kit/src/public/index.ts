/**
 * Public surface of `@delendai/test-kit`. Test-only helpers shared
 * across every workspace's `*.spec.ts` / `*.test.ts` files.
 */
export { fakePartial } from '../lib/fake-partial.helper';
export type { IFakePartialInput } from '../contracts/interfaces/fake-partial.interface';
export { createFakeToolServer } from '../lib/fake-tool-server.helper';
export { asArray } from '../lib/as-array.helper';
export {
	createLegacyWorkspaceFixture,
	hashWorkspaceTree,
} from '../lib/fixtures/legacy-workspace/index';
export type {
	IFakeLoggingMessage,
	IFakeRegisteredTool,
	IFakeToolServerOverrides,
} from '../contracts/interfaces/fake-tool-server.interface';

// Wait for the thing, not for the clock.
export { waitUntil } from '../lib/wait-until.helper';
export {
	captureWorkingState,
	workingStateChanges,
} from '../lib/working-state.helper';
export type {
	IWorkingPathState,
	IWorkingState,
} from '../contracts/interfaces/working-state.interface';
