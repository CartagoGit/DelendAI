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

/**
 * x00530 S3 — refusal-storm + push-circuit detection.
 *
 * `@delendai/error-reporting` diagnoses refusal storms from a log
 * file and MUST agree with the live engine (same window, same
 * threshold, same `(trigger, code)` key), so it reuses these
 * rather than reimplementing them. They used to be reachable only
 * through a `lib/services/...` deep path, an export
 * entry that declared `types` but no `import` condition — i.e. a
 * subpath that type-checked in the monorepo and failed to resolve
 * at runtime from npm. They are part of the supported surface, so
 * they belong on `./public`.
 */
export {
	StormDetector,
	inferSuggestedFix,
} from '../lib/services/storm-detector';
export {
	createPushCircuit,
	buildPushCircuitNotice,
} from '../lib/services/push-circuit';
