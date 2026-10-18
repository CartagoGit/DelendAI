/**
 * branch-delivery.spec.ts — a branch counts as delivered only when the
 * ref-lifecycle verdict says so, in THIS project's namespaces.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { branchDeliveryVerdict } from '../../../../src/lib/ref-lifecycle/branch-delivery.service';

let root = '';

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'branch-delivery-'));
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: {
					integration: 'trunk',
					release: 'stable',
					namespacePrefix: 'acme',
				},
			},
		}),
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('branchDeliveryVerdict', () => {
	it('proves a work ref delivered once its content is in the integration branch', async () => {
		const verdict = await branchDeliveryVerdict(root, {
			name: 'acme/wip/bot/implement/x1-S1-g1/topic',
			publishedIn: 'trunk',
		});
		expect(verdict).toMatchObject({
			role: 'work-published',
			delivered: true,
		});
	});

	it('does not prove a work ref nothing contains', async () => {
		const verdict = await branchDeliveryVerdict(root, {
			name: 'acme/wip/bot/implement/x1-S1-g1/topic',
		});
		expect(verdict).toMatchObject({ role: 'work', delivered: false });
	});

	it('does not prove a publication ref with no pull request behind it', async () => {
		const verdict = await branchDeliveryVerdict(root, {
			name: 'acme/pr/bot/implement/x1-S1-g1/topic',
			publishedIn: 'trunk',
		});
		expect(verdict.delivered).toBe(false);
	});

	it('does not prove a branch outside every namespace, however merged it is', async () => {
		const verdict = await branchDeliveryVerdict(root, {
			name: 'feature/legacy',
			publishedIn: 'trunk',
		});
		expect(verdict).toMatchObject({ role: 'unmanaged', delivered: false });
	});

	it('judges a branch in a named extra namespace as a work ref of it', async () => {
		const verdict = await branchDeliveryVerdict(
			root,
			{ name: 'agent/old-session', publishedIn: 'trunk' },
			['agent/'],
		);
		expect(verdict.delivered).toBe(true);
		expect(
			await branchDeliveryVerdict(root, {
				name: 'agent/old-session',
				publishedIn: 'trunk',
			}),
		).toMatchObject({ role: 'unmanaged', delivered: false });
	});

	it('never proves the integration branch itself', async () => {
		const verdict = await branchDeliveryVerdict(root, {
			name: 'trunk',
			publishedIn: 'trunk',
		});
		expect(verdict).toMatchObject({ role: 'protected', delivered: false });
	});

	describe('a work ref whose proposal the work-ref rule holds open', () => {
		const ref = 'acme/wip/bot/implement/x00001-S1-g1/topic';
		const git = (...args: string[]): void => {
			execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
		};
		const proposalIn = (folder: string): void => {
			rmSync(join(root, 'docs'), { recursive: true, force: true });
			mkdirSync(join(root, 'docs/proposals', folder), {
				recursive: true,
			});
			writeFileSync(
				join(root, 'docs/proposals', folder, 'x00001-topic.md'),
				'# x00001\n',
			);
			git('add', '-A');
			git('commit', '-q', '-m', folder);
		};

		beforeEach(() => {
			git('init', '-q', '-b', 'trunk');
			git('config', 'user.email', 'bot@example.invalid');
			git('config', 'user.name', 'bot');
		});

		it('is kept while the integration branch holds its proposal in progress', async () => {
			proposalIn('in-progress');
			git('branch', ref);
			const verdict = await branchDeliveryVerdict(root, {
				name: ref,
				publishedIn: 'trunk',
			});
			expect(verdict).toMatchObject({
				role: 'work-published',
				delivered: false,
			});
			expect(verdict.reason).toContain('in progress');
		});

		it('is delivered once the proposal leaves in progress, whatever its landed tip says', async () => {
			proposalIn('in-progress');
			git('branch', ref);
			proposalIn('review');
			const verdict = await branchDeliveryVerdict(root, {
				name: ref,
				publishedIn: 'trunk',
			});
			expect(verdict).toMatchObject({
				role: 'work-published',
				delivered: true,
			});
		});
	});
});
