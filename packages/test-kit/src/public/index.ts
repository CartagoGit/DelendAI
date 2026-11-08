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

// Specs that stop waiting for real time and rebuilding real repositories.
export { useFakeClock } from '../lib/fake-clock.helper';
export type { IFakeClock } from '../contracts/interfaces/fake-clock.interface';
export { stubAbortSignalTimeout } from '../lib/abort-signal-timeout.helper';
export type { IAbortSignalTimeoutStub } from '../contracts/interfaces/abort-signal-timeout.interface';
export { skipLockPauses } from '../lib/lock-pause.helper';
export { createGitRepoTemplate } from '../lib/template-git-repo.helper';
export type {
	IGitRepoCopy,
	IGitRepoTemplate,
	IGitRepoTemplateSpec,
} from '../contracts/interfaces/git-repo-template.interface';
export { createInMemoryGit } from '../lib/in-memory-git.helper';
export type {
	IGitAnswers,
	IInMemoryGit,
} from '../contracts/interfaces/in-memory-git.interface';

// A spec sees no variable of the shell that runs it.
export { clearAmbientEnvironment } from '../lib/hermetic-environment.helper';
export type { IAmbientEnvironmentMarkers } from '../contracts/interfaces/hermetic-environment.interface';
