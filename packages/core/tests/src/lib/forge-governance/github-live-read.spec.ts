/**
 * github-live-read.spec.ts — pins the distinction GitHub's API makes easy
 * to lose: "this branch has no protection" is a READ fact, while "we could
 * not ask" is not.
 *
 * Collapsing the two is how a governance gate ends up green on a
 * repository nobody has credentials for, so each direction is asserted
 * separately, along with the refusal to invent values from a body that
 * did not parse.
 */
import { describe, expect, it } from 'vitest';

import {
	branchPropertyId,
	repositoryPropertyId,
} from '@delendai/core/lib/forge-governance/governance-contracts';
import { createGithubForgeAdapter } from '@delendai/core/lib/forge-governance/index';
import {
	classifyProtectionFailure,
	parseBranchProperties,
	parseJsonObject,
	parseRepositoryProperties,
	unprotectedBranchProperties,
	unreadableBranchProperties,
} from '@delendai/core/lib/forge-governance/github-live-read';

describe('parsing GitHub protection', () => {
	it('maps a protection body onto governed properties', () => {
		const properties = parseBranchProperties('develop', {
			required_status_checks: { strict: true, contexts: ['ci-complete'] },
			required_pull_request_reviews: {
				required_approving_review_count: 1,
			},
			required_linear_history: { enabled: true },
			allow_force_pushes: { enabled: false },
			enforce_admins: { enabled: true },
		});

		expect(
			properties[branchPropertyId('develop', 'requireChecksUpToDate')],
		).toEqual({ kind: 'value', value: true });
		expect(
			properties[branchPropertyId('develop', 'requiredChecks')],
		).toEqual({ kind: 'value', value: ['ci-complete'] });
		expect(
			properties[branchPropertyId('develop', 'requirePullRequest')],
		).toEqual({ kind: 'value', value: true });
		expect(
			properties[branchPropertyId('develop', 'requiredApprovingReviews')],
		).toEqual({ kind: 'value', value: 1 });
		// Omitted by GitHub when off — that is information, not an unknown.
		expect(
			properties[branchPropertyId('develop', 'allowDeletion')],
		).toEqual({ kind: 'value', value: false });
	});

	it('treats an unprotected branch as read (and therefore failing), not unreadable', () => {
		const properties = unprotectedBranchProperties('develop');

		expect(
			properties[branchPropertyId('develop', 'requirePullRequest')],
		).toEqual({ kind: 'value', value: false });
	});

	it('marks every property of a branch unreadable when the request failed', () => {
		const properties = unreadableBranchProperties('develop', 'HTTP 403');

		expect(
			Object.values(properties).every(
				(value) => value.kind === 'unreadable',
			),
		).toBe(true);
	});

	it('maps repository merge settings', () => {
		const properties = parseRepositoryProperties({
			allow_squash_merge: true,
			allow_merge_commit: false,
			delete_branch_on_merge: true,
		});

		expect(properties[repositoryPropertyId('allowSquashMerge')]).toEqual({
			kind: 'value',
			value: true,
		});
		expect(properties[repositoryPropertyId('allowRebaseMerge')]).toEqual({
			kind: 'value',
			value: false,
		});
	});

	it('refuses to invent a body that did not parse', () => {
		expect(parseJsonObject('not json')).toBeUndefined();
		expect(parseJsonObject('[1,2]')).toBeUndefined();
	});
});

/**
 * GitHub answers 404 for several different situations and only the body
 * distinguishes them. Reading the status code alone turned a typo'd
 * repository name into a confident "every branch is unprotected" — a
 * positive claim that was never verified. These specs hold the line that
 * only the explicit wording is a fact.
 */
describe('classifyProtectionFailure', () => {
	it('treats an explicit "Branch not protected" body as the read fact', () => {
		expect(
			classifyProtectionFailure(
				'{"message":"Branch not protected","documentation_url":"https://docs.github.com"}',
				'gh: Branch not protected (HTTP 404)',
			),
		).toEqual({ kind: 'unprotected' });
	});

	it('falls back to the gh stderr wording when the body is absent', () => {
		expect(
			classifyProtectionFailure(
				'',
				'gh: Branch not protected (HTTP 404)',
			),
		).toEqual({ kind: 'unprotected' });
	});

	it('does NOT treat a bare "Not Found" 404 as unprotected', () => {
		const classified = classifyProtectionFailure(
			'{"message":"Not Found","status":"404"}',
			'gh: Not Found (HTTP 404)',
		);

		expect(classified.kind).toBe('unreadable');
		expect(
			classified.kind === 'unreadable' ? classified.reason : '',
		).toContain('could not be resolved');
	});

	it('does NOT treat a permission failure as unprotected', () => {
		expect(
			classifyProtectionFailure(
				'{"message":"Resource not accessible by integration"}',
				'gh: Resource not accessible by integration (HTTP 403)',
			).kind,
		).toBe('unreadable');
	});

	it('does NOT treat a malformed body with a 404 status as unprotected', () => {
		expect(
			classifyProtectionFailure(
				'<html>404</html>',
				'gh: Not Found (HTTP 404)',
			).kind,
		).toBe('unreadable');
	});

	it('is unreadable when GitHub says nothing at all', () => {
		expect(classifyProtectionFailure('', '').kind).toBe('unreadable');
	});
});

describe('the GitHub adapter routes 404s through the classifier', () => {
	const readBranch = async (stdout: string, stderr: string) => {
		const adapter = createGithubForgeAdapter({
			env: {},
			exec: async () => ({
				ok: false,
				code: 1,
				stdout,
				stderr,
				timedOut: false,
				unavailable: false,
			}),
		});
		const live = await adapter.readLiveState({
			target: { owner: 'acme', repository: 'widgets' },
			branches: ['develop'],
		});
		return live.properties[
			branchPropertyId('develop', 'requirePullRequest')
		];
	};

	it('reports a genuinely unprotected branch as a READ false', async () => {
		expect(
			await readBranch('{"message":"Branch not protected"}', ''),
		).toEqual({ kind: 'value', value: false });
	});

	it('reports a wrong-repository 404 as unreadable, not as unprotected', async () => {
		const property = await readBranch(
			'{"message":"Not Found"}',
			'gh: Not Found (HTTP 404)',
		);

		expect(property?.kind).toBe('unreadable');
	});

	it('never claims unprotected when the gh CLI is missing entirely', async () => {
		const adapter = createGithubForgeAdapter({
			env: {},
			exec: async () => ({
				ok: false,
				code: 127,
				stdout: '',
				stderr: '',
				timedOut: false,
				unavailable: true,
			}),
		});

		const live = await adapter.readLiveState({
			target: { owner: 'acme', repository: 'widgets' },
			branches: ['develop'],
		});

		expect(
			Object.values(live.properties).every(
				(value) => value.kind === 'unreadable',
			),
		).toBe(true);
	});
});
