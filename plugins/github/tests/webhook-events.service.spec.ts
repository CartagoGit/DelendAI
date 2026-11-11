/**
 * webhook-events.service.spec.ts — GitHub's payloads become the forge's
 * neutral events, and a delivery signed with any other secret is refused.
 *
 * Payloads are trimmed copies of GitHub's documented shapes: only the fields
 * the adapter reads, plus the repository and sender every delivery carries.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createForgeEventNormaliser } from '@delendai/forge/public';

import {
	createGitHubEventAdapter,
	mapGitHubEvent,
	verifyGitHubSignature,
} from '../src/lib/webhook-events.service';

const repository = { full_name: 'octo/repo' };
const human = { login: 'ana', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };

const pr = (extra: Record<string, unknown> = {}) => ({
	number: 12,
	head: { ref: 'feature', sha: 'abc' },
	base: { ref: 'develop' },
	labels: [{ name: 'delendai:needs-update' }],
	...extra,
});

const eventsOf = (name: string, payload: unknown) => {
	const mapped = mapGitHubEvent(name, payload);
	return 'events' in mapped ? mapped.events : mapped.dropped;
};

describe('mapGitHubEvent', () => {
	it('[<5ms] maps a branch push, and drops a tag push and a deletion', () => {
		expect(
			eventsOf('push', {
				ref: 'refs/heads/develop',
				after: 'f00',
				repository,
				sender: human,
			}),
		).toEqual([
			{
				kind: 'branch.pushed',
				repository: 'octo/repo',
				actor: { name: 'ana', bot: false },
				branch: 'develop',
				sha: 'f00',
			},
		]);
		expect(
			eventsOf('push', {
				ref: 'refs/tags/v1',
				repository,
				sender: human,
			}),
		).toBe('unmapped:push.tag');
		expect(
			eventsOf('push', {
				ref: 'refs/heads/x',
				deleted: true,
				repository,
				sender: human,
			}),
		).toBe('unmapped:push.deleted');
	});

	it('[<5ms] maps every pull_request action it declares', () => {
		const kinds = (action: string, extra: Record<string, unknown> = {}) => {
			const events = eventsOf('pull_request', {
				action,
				pull_request: pr(extra),
				repository,
				sender: human,
			});
			return typeof events === 'string'
				? events
				: events.map((event) => [event.kind, event.change]);
		};
		expect(kinds('opened')).toEqual([['pr.opened', undefined]]);
		expect(kinds('reopened')).toEqual([['pr.opened', 'reopened']]);
		expect(kinds('ready_for_review')).toEqual([['pr.ready', undefined]]);
		expect(kinds('closed', { merged: true })).toEqual([
			['pr.merged', undefined],
		]);
		expect(kinds('closed', { merged: false })).toEqual([
			['pr.closed', undefined],
		]);
		expect(kinds('synchronize')).toEqual([['pr.updated', 'synchronized']]);
		expect(kinds('edited')).toEqual([['pr.updated', 'edited']]);
		expect(kinds('converted_to_draft')).toEqual([
			['pr.updated', 'drafted'],
		]);
		expect(kinds('unlabeled')).toEqual([['pr.updated', 'unlabelled']]);
		expect(kinds('assigned')).toBe('unmapped:pull_request.assigned');
	});

	it('[<5ms] carries the label, the branches and a bot sender of a pull request', () => {
		expect(
			eventsOf('pull_request', {
				action: 'labeled',
				label: { name: 'delendai:needs-update' },
				pull_request: pr(),
				repository,
				sender: bot,
			}),
		).toEqual([
			{
				kind: 'pr.updated',
				change: 'labelled',
				label: 'delendai:needs-update',
				repository: 'octo/repo',
				actor: { name: 'github-actions[bot]', bot: true },
				number: 12,
				branch: 'feature',
				base: 'develop',
				sha: 'abc',
				labels: ['delendai:needs-update'],
			},
		]);
	});

	it('[<5ms] maps a completed check run and drops one still running', () => {
		expect(
			eventsOf('check_run', {
				action: 'completed',
				check_run: {
					name: 'delendai-validate',
					conclusion: 'success',
					head_sha: 'abc',
					check_suite: { head_branch: 'feature' },
					pull_requests: [{ number: 12 }],
				},
				repository,
				sender: bot,
			}),
		).toEqual([
			{
				kind: 'check.completed',
				repository: 'octo/repo',
				actor: { name: 'github-actions[bot]', bot: true },
				number: 12,
				branch: 'feature',
				sha: 'abc',
				check: 'delendai-validate',
				conclusion: 'success',
			},
		]);
		expect(
			eventsOf('check_run', {
				action: 'created',
				repository,
				sender: bot,
			}),
		).toBe('unmapped:check_run.created');
	});

	it('[<5ms] maps a submitted review and drops a dismissed one', () => {
		expect(
			eventsOf('pull_request_review', {
				action: 'submitted',
				review: { state: 'approved' },
				pull_request: pr(),
				repository,
				sender: human,
			}),
		).toMatchObject([
			{ kind: 'review.submitted', number: 12, review: 'approved' },
		]);
		expect(
			eventsOf('pull_request_review', {
				action: 'dismissed',
				repository,
				sender: human,
			}),
		).toBe('unmapped:pull_request_review.dismissed');
	});

	it('[<5ms] maps issues opened, updated and closed', () => {
		const issue = { number: 3, labels: [{ name: 'bug' }] };
		const of = (action: string, extra: Record<string, unknown> = {}) =>
			eventsOf('issues', {
				action,
				issue,
				repository,
				sender: human,
				...extra,
			});
		expect(of('opened')).toMatchObject([
			{ kind: 'issue.opened', number: 3, labels: ['bug'] },
		]);
		expect(of('closed')).toMatchObject([
			{ kind: 'issue.closed', number: 3 },
		]);
		expect(of('labeled', { label: { name: 'bug' } })).toMatchObject([
			{ kind: 'issue.updated', change: 'labelled', label: 'bug' },
		]);
		expect(of('assigned')).toMatchObject([{ kind: 'issue.updated' }]);
		expect(of('transferred')).toBe('unmapped:issues.transferred');
	});

	it('[<5ms] drops an event it does not map and a payload with no repository', () => {
		expect(eventsOf('ping', { zen: 'hi', repository })).toBe(
			'unmapped:ping',
		);
		expect(eventsOf('push', { ref: 'refs/heads/x' })).toBe(
			'no-repository:push',
		);
		expect(eventsOf('push', 'not an object')).toBe('no-repository:push');
	});
});

describe('verifyGitHubSignature', () => {
	const body = '{"zen":"hi"}';
	const sign = (secret: string): string =>
		`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

	it('[<5ms] accepts the signature made with this secret', () => {
		expect(
			verifyGitHubSignature(
				{ headers: { 'x-hub-signature-256': sign('s3') }, body },
				's3',
			),
		).toBe(true);
	});

	it('[<5ms] refuses another secret, a missing header and a malformed one', () => {
		expect(
			verifyGitHubSignature(
				{ headers: { 'x-hub-signature-256': sign('other') }, body },
				's3',
			),
		).toBe(false);
		expect(verifyGitHubSignature({ headers: {}, body }, 's3')).toBe(false);
		expect(
			verifyGitHubSignature(
				{ headers: { 'x-hub-signature-256': 'sha1=abc' }, body },
				's3',
			),
		).toBe(false);
		expect(
			verifyGitHubSignature(
				{ headers: { 'x-hub-signature-256': 'sha256=short' }, body },
				's3',
			),
		).toBe(false);
	});
});

describe('createGitHubEventAdapter', () => {
	it('[<5ms] feeds the forge normaliser through the port', () => {
		const normaliser = createForgeEventNormaliser(
			createGitHubEventAdapter(),
		);
		const events = normaliser.normalise({
			headers: { 'x-github-event': 'push' },
			body: JSON.stringify({
				ref: 'refs/heads/develop',
				after: 'f00',
				repository,
				sender: human,
			}),
		});
		expect(events.map((event) => event.kind)).toEqual(['branch.pushed']);
		normaliser.normalise({
			headers: { 'x-github-event': 'ping' },
			body: '{}',
		});
		expect(normaliser.drops()).toEqual({ 'unmapped:ping': 1 });
	});
});
