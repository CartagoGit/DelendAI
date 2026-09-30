/**
 * branch-delivery.spec.ts — a branch counts as delivered only when the
 * ref-lifecycle verdict says so, in THIS project's namespaces.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
});
