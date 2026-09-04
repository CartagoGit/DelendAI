/**
 * public/index.ts — programmatic surface for `@delendai/commit-policy`.
 */

export { default } from '../index';

export { CommitPolicyOptionsSchema } from '../lib/contracts/options';
export {
	buildReleaseBranch,
	isReleaseBranch,
} from '../lib/contracts/release-branch';
export type {
	ICommitPolicyOptions,
	ICommitPolicyIdentity,
	ICommitPolicyAudit,
	ICommitPolicyCadence,
	ICommitPolicyCommit,
	ICommitPolicyPush,
	CommitPolicyIdentityMode,
	AuditTrailerKind,
	TriggerKind,
	ForceMode,
} from '../lib/contracts/options';

export { resolveAuthor } from '../lib/identity/resolver';
export type {
	IResolvedAuthor,
	IAuthorResolution,
	IIdentityResolverContext,
} from '../lib/identity/resolver';

export {
	commitWithGuard,
	runCommitDriver,
} from '../lib/services/commit-driver';
export type {
	ICommitTrace as CommitTrace,
	ICommitTrace,
	ICommitDriverInput,
	ICommitDriverOptions,
	ICommitDriverResult,
} from '../lib/services/commit-driver';

export { runPushDriver } from '../lib/services/push-driver';
export type {
	IPushDriverInput,
	IPushDriverResult,
} from '../lib/services/push-driver';

export { appendAuditTrailer } from '../lib/audit/trailer';
export type { IAuditAgent } from '../lib/audit/trailer';

export {
	localizedString,
	SUPPORTED_LOCALES,
} from '../lib/contracts/i18n-types';
export type { Locale, IStringCatalog } from '../lib/contracts/i18n-types';

export {
	createSliceListener,
	readCurrentSliceSnapshot,
} from '../lib/triggers/slice-listener';
export { createThresholdTracker } from '../lib/triggers/threshold-tracker';
export { createIntervalTimer } from '../lib/triggers/interval-timer';
export { manualTrigger } from '../lib/triggers/manual-trigger';
export { findTrigger } from '../lib/triggers/trigger-types';
export type {
	ITriggerEvent,
	ITriggerState,
	ISliceTriggerConfig,
	IThresholdTriggerConfig,
	IIntervalTriggerConfig,
	IManualTriggerConfig,
} from '../lib/triggers/trigger-types';
