/**
 * github-live-read.ts — turns GitHub's JSON into the broker's property
 * map, and is the file that decides what "could not be read" means.
 *
 * It is separate from the adapter because parsing is where the tri-state
 * is actually won or lost. The tempting shortcut — `json?.enabled ??
 * false` — converts "GitHub did not tell us" into a confident `false`,
 * which then diffs as a clean `FAIL` or, worse, as a `PASS`. So a failed
 * or unparseable response produces `unreadable` for EVERY property it
 * covers, and only a successfully parsed body is allowed to yield values.
 *
 * Within a body that did parse, an absent sub-object is genuine
 * information: GitHub omits `required_linear_history` when the feature is
 * off, so absence there is a readable `false`, not an unknown.
 */

import {
	BRANCH_PROPERTIES,
	branchPropertyId,
	REPOSITORY_PROPERTIES,
	repositoryPropertyId,
} from './governance-contracts';
import {
	liveUnreadable,
	liveValue,
	type LiveValue,
} from './provider-contracts';
import { safeProviderMessage } from './redact-secrets';

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Json)
		: undefined;

const enabledFlag = (value: unknown): boolean =>
	asObject(value)?.enabled === true;

const stringList = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

/** Parse a JSON document, returning undefined rather than throwing. */
export const parseJsonObject = (text: string): Json | undefined => {
	try {
		return asObject(JSON.parse(text) as unknown);
	} catch {
		return undefined;
	}
};

/**
 * `gh` prints errors as `gh: <message> (HTTP <status>)`. Reduce that to
 * the message so the stderr fallback compares the same wording the body
 * would have carried.
 */
const stripGhPrefix = (stderr: string): string =>
	stderr
		.trim()
		.replace(/^gh:\s*/iu, '')
		.replace(/\s*\(HTTP\s+\d{3}\)\s*$/iu, '')
		.trim();

/** Every repository property marked unreadable, with one shared reason. */
export const unreadableRepositoryProperties = (
	reason: string,
): Readonly<Record<string, LiveValue>> => {
	const safe = safeProviderMessage(reason);
	const properties: Record<string, LiveValue> = {};
	for (const property of REPOSITORY_PROPERTIES) {
		properties[repositoryPropertyId(property)] = liveUnreadable(safe);
	}
	return properties;
};

/** Every property of one branch marked unreadable. */
export const unreadableBranchProperties = (
	branch: string,
	reason: string,
): Readonly<Record<string, LiveValue>> => {
	const safe = safeProviderMessage(reason);
	const properties: Record<string, LiveValue> = {};
	for (const property of BRANCH_PROPERTIES) {
		properties[branchPropertyId(branch, property)] = liveUnreadable(safe);
	}
	return properties;
};

/** Map `GET /repos/{owner}/{repo}` onto the repository properties. */
export const parseRepositoryProperties = (
	body: Json,
): Readonly<Record<string, LiveValue>> => ({
	[repositoryPropertyId('allowSquashMerge')]: liveValue(
		body.allow_squash_merge === true,
	),
	[repositoryPropertyId('allowMergeCommit')]: liveValue(
		body.allow_merge_commit === true,
	),
	[repositoryPropertyId('allowRebaseMerge')]: liveValue(
		body.allow_rebase_merge === true,
	),
	[repositoryPropertyId('deleteBranchOnMerge')]: liveValue(
		body.delete_branch_on_merge === true,
	),
});

/** Map `GET …/branches/{branch}/protection` onto the branch properties. */
export const parseBranchProperties = (
	branch: string,
	body: Json,
): Readonly<Record<string, LiveValue>> => {
	const reviews = asObject(body.required_pull_request_reviews);
	const checks = asObject(body.required_status_checks);
	const reviewCount = reviews?.required_approving_review_count;
	const id = (property: (typeof BRANCH_PROPERTIES)[number]): string =>
		branchPropertyId(branch, property);
	return {
		[id('requirePullRequest')]: liveValue(reviews !== undefined),
		[id('requiredApprovingReviews')]: liveValue(
			typeof reviewCount === 'number' ? reviewCount : 0,
		),
		[id('requiredChecks')]: liveValue(stringList(checks?.contexts)),
		[id('requireChecksUpToDate')]: liveValue(checks?.strict === true),
		[id('requireLinearHistory')]: liveValue(
			enabledFlag(body.required_linear_history),
		),
		[id('allowForcePush')]: liveValue(enabledFlag(body.allow_force_pushes)),
		[id('allowDeletion')]: liveValue(enabledFlag(body.allow_deletions)),
		[id('requireConversationResolution')]: liveValue(
			enabledFlag(body.required_conversation_resolution),
		),
		[id('enforceAdmins')]: liveValue(enabledFlag(body.enforce_admins)),
	};
};

/**
 * An unprotected branch is a readable fact, not an unknown: when GitHub
 * says in so many words that the branch exists and carries no rule, every
 * guarantee is absent. Reporting THAT as `NOT_EXECUTABLE` would hide a
 * real, fixable gap behind "could not check".
 *
 * It is only ever reached through `classifyProtectionFailure`, which is
 * what keeps the claim honest — see that function's contract.
 */
export const unprotectedBranchProperties = (
	branch: string,
): Readonly<Record<string, LiveValue>> => parseBranchProperties(branch, {});

/**
 * How a failed protection read should be interpreted. `unprotected` is a
 * positive factual claim; `unreadable` is the absence of one.
 */
export type ProtectionFailure =
	| { readonly kind: 'unprotected' }
	| { readonly kind: 'unreadable'; readonly reason: string };

/** GitHub's exact wording for "this branch exists and has no rule". */
const BRANCH_NOT_PROTECTED = /^\s*branch not protected\s*\.?\s*$/iu;

/** The `message` field of a GitHub error body, when there is one. */
const errorMessage = (stdout: string): string | undefined => {
	const message = parseJsonObject(stdout)?.message;
	return typeof message === 'string' && message.trim().length > 0
		? message.trim()
		: undefined;
};

/**
 * Decide what a failed `…/branches/{branch}/protection` read means.
 *
 * GitHub answers 404 for several genuinely different situations and only
 * distinguishes them in the response body: `{"message":"Branch not
 * protected"}` when the branch exists and carries no rule, and
 * `{"message":"Not Found"}` when the repository or branch does not
 * exist, was renamed, or is invisible to the credential in use. Treating
 * the status code alone as "unprotected" turns a typo'd repository name
 * or a permissions-shaped 404 into a confident, unverified claim that a
 * branch has no protection — which routes straight around the tri-state
 * this subsystem exists to enforce.
 *
 * So: ONLY the explicit "Branch not protected" wording yields the factual
 * claim. Every other failure, and anything ambiguous, is `unreadable` and
 * becomes `NOT_EXECUTABLE`. The body is preferred over stderr because
 * `gh` writes the JSON error body to stdout; the stderr wording is a
 * fallback for when the body is absent or unparseable.
 */
export const classifyProtectionFailure = (
	stdout: string,
	stderr: string,
): ProtectionFailure => {
	const message = errorMessage(stdout);
	if (message !== undefined) {
		return BRANCH_NOT_PROTECTED.test(message)
			? { kind: 'unprotected' }
			: {
					kind: 'unreadable',
					reason: `GitHub answered "${safeProviderMessage(message)}"; the branch protection resource could not be resolved, which is NOT evidence that the branch is unprotected.`,
				};
	}
	if (BRANCH_NOT_PROTECTED.test(stripGhPrefix(stderr))) {
		return { kind: 'unprotected' };
	}
	const detail = safeProviderMessage(stderr);
	return {
		kind: 'unreadable',
		reason:
			detail.length > 0
				? `The branch protection resource could not be resolved (${detail}); this is NOT evidence that the branch is unprotected.`
				: 'The branch protection resource could not be resolved and GitHub returned no message; this is NOT evidence that the branch is unprotected.',
	};
};
