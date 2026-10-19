/**
 * runtime/index.ts — subpath export for @delendai/core/runtime.
 *
 * r00028 (Track C / §9): runtime helpers (commit, push, file
 * reading/writing, mutex) — Node-aware. Plugins that need a
 * runtime value but do NOT need the full public surface should
 * import from this subpath to keep their dependency footprint
 * small.
 */

export { commitAndPush } from '../lib/shared/git-write';
export {
	writeFileAtomic,
	writeFileAtomicSync,
} from '../lib/shared/atomic-write';
export { withFileMutex } from '../lib/shared/with-file-mutex';
// One record of how each model did, read by every ranking and learner.
export { modelOutcomeStoreAt } from '../lib/shared/model-outcome-store.service';
export {
	rankModels,
	scoreModel,
	winRatesOf,
} from '../lib/shared/model-ranking.service';
// Which known vendor clients this machine has, and whether each can work.
export {
	clientVerdict,
	discoverClients,
	listClientModels,
	probeClientCommand,
} from '../lib/shared/client-discovery.service';
// Where a plugin keeps a record about the workspace (a lock, a journal):
// the records folder of the cache directory, as delendai keeps its own.
export { recordPath } from '../lib/shared/delendai-records';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export { createFileArtifactStore } from '../lib/context-store/file-artifact-store';
export { renderDelegationPrompt } from '../lib/subagents/delegation-prompt.helper';
export { agentToolProfile } from '../lib/agents/agent-tool-profiles';
export { writePublicationDispositions } from '../lib/work-units/publication-dispositions.service';
export type { ISafeWorkspaceReaderOptions } from '../lib/filesystem/safe-workspace-reader';
export { WorkspaceContainmentError } from '../lib/filesystem/safe-workspace-reader.errors';
export type {
	ICommitAndPushOptions,
	ICommitAndPushResult,
} from '../lib/shared/git-write';
export type {
	IGitRunner,
	IGitRunResult,
} from '../lib/contracts/interfaces/git-runner.interface';
export {
	parsePluginManifest,
	pluginManifestJsonSchema,
} from '../lib/manifest/define-plugin-manifest';
export { RESERVED_PACKAGE_SCOPE } from '../lib/contracts/constants/plugin-package-scope.constant';
export { splitCommandLine } from '../lib/shared/command-line.helper';
export type { IWorkRefVerdict } from '../lib/contracts/interfaces/work-ref-lifecycle.interface';
export {
	workRefFate,
	workRefOpenness,
} from '../lib/work-units/work-ref-lifecycle.service';
export { workRefOpennessOf } from '../lib/wip-engine/proposal-in-progress.helper';
export { hookFreeEnvironment } from '../lib/shared/hook-free-environment.helper';
export { gitVerbatim, readGit } from '../lib/shared/git-read.helper';
export { runGitCommand } from '../lib/shared/git-command.helper';
export type {
	IGitCommandOptions,
	IGitCommandResult,
} from '../lib/contracts/interfaces/git-command.interface';
export type { IGitReadOptions } from '../lib/contracts/interfaces/git-read.interface';
export {
	recordWorkRefMove,
	workRefMover,
	workRefMovesPathAt,
	workRefMovesPathVia,
} from '../lib/work-units/work-ref-moves.service';
export {
	fetchMakerNotes,
	makersOf,
	pushMakerNotes,
	recordCommitMaker,
	recordUnitCommit,
} from '../lib/work-units/commit-maker-notes.service';
