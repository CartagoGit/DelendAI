/**
 * github-protection.lib.ts — x00276 / x00277 / x00278 (AUD-A04, AUD-A05, AUD-A06).
 *
 * Single fetch + error-policy owner for the GitHub branch-protection
 * REST endpoint, shared by `verify-branch-protection.script.ts` and
 * `verify-develop-health.script.ts`. Before this file existed the two
 * scripts each opened their own `fetch` against the same endpoint and
 * had drifted to opposite error policies for the same 401/403
 * response: one silently returned a false "verified" green
 * (`AUD-A05`), the other threw and turned every run red (`AUD-A04`).
 * Extracting the fetch here makes that divergence structurally
 * impossible — there is exactly one place that decides what a given
 * HTTP status means, and both scripts consume its verdict rather than
 * each guessing their own.
 *
 * The response body is parsed with Zod, never cast with `as`. The
 * original `AUD-A06` bug (`allow_deletion` vs `allow_deletions`) was a
 * typo that survived compilation only because the response was cast
 * instead of parsed — a missing/misnamed field silently became
 * `undefined` instead of a build-time or run-time error. Declaring the
 * fields as required in the schema turns that class of typo back into
 * a loud parse failure.
 *
 * This module owns fetching and error policy ONLY. Policy comparison
 * (what counts as drift) and reporting shape stay in the two scripts —
 * see `verify-branch-protection.script.ts` and
 * `verify-develop-health.script.ts`.
 */

import { appendFile } from 'node:fs/promises';

import z from 'zod';

const GITHUB_API_VERSION = '2022-11-28';

const booleanFlag = z.object({ enabled: z.boolean() });

const githubBranchProtectionResponseSchema = z.object({
	enforce_admins: booleanFlag,
	required_linear_history: booleanFlag,
	allow_force_pushes: booleanFlag,
	allow_deletions: booleanFlag,
	// GitHub returns `null` (not an omitted key) when no status checks
	// are required on an otherwise-protected branch.
	required_status_checks: z
		.object({
			strict: z.boolean().optional(),
			contexts: z.array(z.string()).optional(),
		})
		.nullable()
		.optional(),
});

export type IGitHubBranchProtectionResponse = z.infer<
	typeof githubBranchProtectionResponseSchema
>;

/**
 * Parse a GitHub branch-protection response body. Throws Zod's own
 * descriptive error (naming the offending field) instead of letting an
 * unexpected or renamed field silently become `undefined` — the
 * failure mode that let `AUD-A06` survive as long as it did.
 */
export const parseGitHubBranchProtectionResponse = (
	json: unknown,
): IGitHubBranchProtectionResponse =>
	githubBranchProtectionResponseSchema.parse(json);

/**
 * Raised when the API refuses a branch's protection to a token the
 * caller explicitly configured for this purpose (`--token` /
 * `BRANCH_PROTECTION_TOKEN`), as opposed to the ambient `GITHUB_TOKEN`
 * every workflow run has and which is known to lack `administration`
 * scope. A deliberately-supplied token that still cannot read is a
 * misconfiguration, not an expected gap — so this is always a hard
 * failure, never `unverified`.
 */
export class GitHubProtectionAuthError extends Error {
	readonly branch: string;

	constructor(branch: string) {
		super(
			`branch protection for "${branch}" is not readable with the token supplied — ` +
				'the token needs repo-admin scope, or is wrong for this repository.',
		);
		this.name = 'GitHubProtectionAuthError';
		this.branch = branch;
	}
}

export type IProtectionFetchResult =
	| { readonly kind: 'live'; readonly data: IGitHubBranchProtectionResponse }
	| { readonly kind: 'unprotected' }
	| { readonly kind: 'unverified'; readonly branch: string };

export interface IFetchBranchProtectionParams {
	readonly repo: string;
	readonly branch: string;
	/** Token used for the `Authorization` header, if any. */
	readonly token: string | undefined;
	/**
	 * Whether `token` was deliberately configured for this purpose
	 * (`--token`, `BRANCH_PROTECTION_TOKEN`) rather than falling back to
	 * the always-present `GITHUB_TOKEN`. Governs whether a 401/403
	 * becomes `unverified` (no explicit token — an expected gap) or
	 * throws `GitHubProtectionAuthError` (explicit token that still
	 * can't read — misconfigured).
	 */
	readonly tokenExplicit: boolean;
}

/**
 * Fetch the live branch protection from GitHub. This is the ONLY
 * fetch against the branch-protection endpoint in the codebase — both
 * verifier scripts route through it so their error policy for a given
 * HTTP status can never diverge again.
 */
export const fetchBranchProtection = async (
	params: IFetchBranchProtectionParams,
): Promise<IProtectionFetchResult> => {
	const { repo, branch, token, tokenExplicit } = params;
	const url = `https://api.github.com/repos/${repo}/branches/${branch}/protection`;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': GITHUB_API_VERSION,
	};
	if (token !== undefined && token.length > 0) {
		headers.Authorization = `Bearer ${token}`;
	}
	const res = await fetch(url, { headers });
	if (res.status === 404) return { kind: 'unprotected' };
	// Reading branch protection needs repo-admin scope, which the ambient
	// `GITHUB_TOKEN` does not have and cannot be granted (`administration`
	// is not a valid workflow `permissions:` entry). Without a
	// deliberately-configured token this is an expected gap, not a
	// finding: report `unverified` rather than either a false pass or a
	// red build. With an explicit token the same response means the
	// token itself is wrong.
	if (res.status === 401 || res.status === 403) {
		if (tokenExplicit) throw new GitHubProtectionAuthError(branch);
		return { kind: 'unverified', branch };
	}
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on ${branch}: ${await res.text()}`,
		);
	}
	return {
		kind: 'live',
		data: parseGitHubBranchProtectionResponse(await res.json()),
	};
};

/**
 * Append a line to `$GITHUB_STEP_SUMMARY` when running in GitHub
 * Actions; no-op outside of it (local runs, `--dry-run`, unit tests)
 * so callers don't need a real file to exercise this path.
 */
export const appendGitHubStepSummary = async (line: string): Promise<void> => {
	const path = process.env.GITHUB_STEP_SUMMARY;
	if (path === undefined || path.length === 0) return;
	await appendFile(path, `${line}\n`, 'utf8');
};

/**
 * Surface the `unverified` state where a human reviewing the job will
 * actually see it: a `::warning::` annotation (shows on the run's
 * summary page and in PR checks) plus a line in
 * `$GITHUB_STEP_SUMMARY` (visible without opening the log at all).
 * `AUD-A05`'s bug was precisely that "not verified" was indistinguishable
 * from "verified and correct" to a reviewer glancing at a green check —
 * this is the fix for that half of the contract.
 */
export const reportUnverifiedBranches = async (
	scriptName: string,
	branches: readonly string[],
): Promise<void> => {
	if (branches.length === 0) return;
	const list = branches.join(', ');
	const noun = branches.length === 1 ? 'it' : 'them';
	process.stdout.write(
		`::warning::${scriptName}: branch protection for ${list} could not be verified with the token in use — nothing was asserted for ${noun}.\n`,
	);
	await appendGitHubStepSummary(
		`⚠️ **${scriptName}**: branch protection for \`${list}\` could not be verified with the token in use.`,
	);
};
