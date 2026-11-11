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
export { COMPUTE_SLOT_ENV } from '../lib/contracts/constants/compute-slot.constant';
export {
	computeSlotPath,
	withComputeSlot,
} from '../lib/shared/compute-slot.service';
export {
	readComputeSlotLane,
	urgentLogPath,
} from '../lib/shared/compute-slot-lane.service';
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
	clientLogin,
	clientVerdict,
	discoverClients,
	listClientModels,
	probeClientCommand,
} from '../lib/shared/client-discovery.service';
export { runClientCommand } from '../lib/shared/client-command-runner.service';
// Account sources and the configured catalogue of clients.
export { findingsFromCredentialVariables } from '../lib/shared/account-sources.service';
export { allKnownClients } from '../lib/shared/known-client.helper';
// Where a plugin keeps a record about the workspace (a lock, a journal):
// the records folder of the cache directory, as delendai keeps its own.
export { recordPath } from '../lib/shared/delendai-records';
export { SafeWorkspaceReader } from '../lib/filesystem/safe-workspace-reader';
export { workspacePackageDirs } from '../lib/shared/workspace-packages.helper';
export {
	findingsReport,
	isOutsideScanScope,
} from '../lib/shared/scan-scope.helper';
export { createFileArtifactStore } from '../lib/context-store/file-artifact-store';
export { renderDelegationPrompt } from '../lib/subagents/delegation-prompt.helper';
export { agentToolProfile } from '../lib/agents/agent-tool-profiles';
export { writePublicationDispositions } from '../lib/work-units/publication-dispositions.service';
// Work whose author is gone: judged, counted and kept moving (x01024).
export {
	judgeAuthor,
	planOrphanRescues,
	publicationPresence,
	readOrphanRescues,
	writeOrphanRescues,
} from '../lib/work-units/orphaned-work.service';
export { recordOwnerOutOfQuota } from '../lib/work-units/unit-lease.service';
export { ORPHAN_RESCUE_ATTEMPTS } from '../lib/contracts/constants/orphaned-work.constant';
export type {
	IAuthorPresence,
	IOrphanReason,
	IOrphanRescueStep,
} from '../lib/contracts/interfaces/orphaned-work.interface';
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
	workRefLanded,
} from '../lib/integration/decisions/landed.helper';
export {
	workRefIntegrationRef,
	workRefOpenness,
} from '../lib/work-units/work-ref-lifecycle.service';
export {
	bodyWithUrgentLine,
	urgencyNotePathOfPublication,
	urgentReasonOfBody,
} from '../lib/work-units/pull-request-urgency.service';
export { settleLanded } from '../lib/wip-engine/landed-work-ref';
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
export {
	discoveryConsentPath,
	readDiscoveryConsent,
	recordDiscoveryConsent,
} from '../lib/shared/discovery-consent-record.service';

export {
	consentDigest,
	createConsentSigner,
} from '../lib/consent/consent-token.service';
export type { IConsentSigner } from '../lib/contracts/interfaces/consent-signer.interface';
export { proposalOfCreateUnit } from '../lib/work-units/unit-adoption.service';
export { applyGitOptionalLocksDefault } from '../lib/shared/git-optional-locks.helper';
export {
	backgroundEnv,
	backgroundNice,
	backgroundWorkers,
	lowPriority,
} from '../lib/platform/background-load.service';
export { currentHostMaintenance } from '../lib/development-policy/maintenance-lease.service';

// The workspace's shared forge event store: the server that hears the forge
// writes each event, every server's notification bridge reads it.
export {
	addForgeEventSubscription,
	appendForgeEventRecord,
	forgeEventRecordsDir,
	forgeEventsDir,
	readForgeEventRecord,
	readForgeEventSubscriptions,
} from '../lib/forge-events/forge-event-store.service';
