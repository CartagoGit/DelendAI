/**
 * finding-catalog.ts — the single table that decides what the reconciler
 * is allowed to do by itself.
 *
 * WHY a table and not a judgement at each call site: "automatic" is only
 * acceptable if the set of automatic actions is finite, reviewable and
 * enumerated in one place. A reviewer must be able to read the SAFE list
 * top to bottom and agree that every entry is a repair whose outcome is
 * fully determined by evidence the reconciler can re-observe (a schema
 * migration it ships, a cache it can recompute, a fetch, a forge fact, an
 * expired lease, a ref whose merge is durably proven).
 *
 * WHY an unknown code classifies as AMBIGUOUS: the failure mode of a
 * lookup table is a code somebody forgot to register. Defaulting to
 * "safe" would make forgetting an entry a silent licence to mutate; the
 * default here makes it a loud DEGRADED instead. Fail closed.
 */

import { createHash } from 'node:crypto';

import type {
	IStartupFinding,
	IStartupRepairTask,
	IRepairClass,
} from './contracts';

import type { IFindingInput } from './finding-catalog.interface';
import {
	SAFE_FINDING_CODES,
	AMBIGUOUS_FINDING_CODES,
	UNVERIFIED_FINDING_CODES,
} from './finding-catalog.constant';

export type { IFindingInput } from './finding-catalog.interface';
export {
	SAFE_FINDING_CODES,
	AMBIGUOUS_FINDING_CODES,
	UNVERIFIED_FINDING_CODES,
} from './finding-catalog.constant';

const SAFE = new Set<string>(SAFE_FINDING_CODES);
const AMBIGUOUS = new Set<string>(AMBIGUOUS_FINDING_CODES);
const UNVERIFIED = new Set<string>(UNVERIFIED_FINDING_CODES);

/**
 * Classify a code. Unknown and unverified codes are AMBIGUOUS: neither
 * may be acted on automatically. They differ only in whether they warrant
 * a repair task (see `needsRepairTask`).
 */
export const classifyFinding = (code: string): IRepairClass =>
	SAFE.has(code) ? 'safe' : 'ambiguous';

/** True when the code names a registered, reviewable safe repair. */
export const isRegisteredSafeRepair = (code: string): boolean => SAFE.has(code);

/**
 * True when a blocker deserves generated repair work. An unverified
 * condition (offline, forge down) resolves itself on the next boot and
 * would otherwise spam the backlog; a genuine ambiguity never does.
 */
export const needsRepairTask = (code: string): boolean =>
	AMBIGUOUS.has(code) || (!SAFE.has(code) && !UNVERIFIED.has(code));

/**
 * Build a finding. The class, the mutation block and the recovery flag
 * are DERIVED from the code, never passed in — that is what stops a
 * future call site from marking a dangerous condition as harmless.
 */
export const finding = (input: IFindingInput): IStartupFinding => {
	const repairClass = classifyFinding(input.code);
	const dangerous = AMBIGUOUS.has(input.code);
	return {
		code: input.code,
		phase: input.phase,
		kind: input.kind,
		repairClass,
		subject: input.subject,
		message: input.message,
		blocksMutation: dangerous && input.kind === 'blocker',
		recoveryRequired: dangerous && input.kind === 'blocker',
		...(input.detail === undefined ? {} : { detail: input.detail }),
	};
};

/** Deterministic task id: the same ambiguity always yields the same id. */
export const repairTaskId = (code: string, subject: string): string =>
	createHash('sha256')
		.update(`startup-repair ${code} ${subject}`, 'utf8')
		.digest('hex')
		.slice(0, 32);

/** Suggested actions per ambiguity. Documentation, not an execution plan. */
const SUGGESTED_ACTIONS: Readonly<Record<string, readonly string[]>> = {
	'work-refs.duplicate-generation': [
		'Inspect both refs; keep both, and re-number the later checkpoint.',
		'Never delete either ref: each may hold work that exists nowhere else.',
	],
	'work-refs.history-rewritten': [
		'Compare the recorded checkpoint SHA with the current ref tip.',
		'Preserve the orphaned commits before any ref is moved.',
	],
	'work-refs.unattributable': [
		'Map the ref to a (proposal, slice, generation) identity, or rename it.',
	],
	'integration-evidence.ref-vanished': [
		'Locate the ref in a reflog or on another remote before concluding loss.',
	],
	'state-database.corrupt': [
		'Keep the corrupt file; rebuild a fresh database from refs and journal.',
	],
	'state-database.absent': [
		'Start the server normally: the first boot creates and rebuilds it.',
	],
	'state-database.ambiguous-migration': [
		'Resolve the legacy rows by hand; the migration cannot infer intent.',
	],
	'leases.overlapping-owners': [
		'Decide which owner keeps the paths; the other must re-scope its work.',
	],
	'governance.destructive-mismatch': [
		'Review the live forge setting against the policy before enforcing.',
	],
	'checkout.head-moved': [
		'Return HEAD to the integration branch WITHOUT discarding work.',
	],
	'environment.policy-invalid': [
		'Fix the development policy; startup will not guess a model.',
	],
	'environment.repository-unknown': [
		'Configure the repository identity (forge/owner/name).',
	],
};

/** Turn a blocking finding into generated repair work. */
export const repairTaskFor = (item: IStartupFinding): IStartupRepairTask => ({
	id: repairTaskId(item.code, item.subject),
	code: item.code,
	phase: item.phase,
	subject: item.subject,
	title: `${item.code}: ${item.subject}`,
	evidence: [item.message],
	suggestedActions: SUGGESTED_ACTIONS[item.code] ?? [
		'Investigate before any mutation; the reconciler refused to guess.',
	],
	blocksMutation: item.blocksMutation,
});
