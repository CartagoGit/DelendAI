import { describe, expect, it } from 'vitest';

import {
	abortRelease,
	createHotfixReceipt,
	reconcileRelease,
	rollbackRelease,
} from '../../src/lib/release-finalize';

describe('git release finalize adapters', () => {
	it('preserves later develop commits during explicit reconciliation', async () => {
		const receipt = await reconcileRelease(
			async () => ({ ok: true, output: '' }),
			{
				releaseSlug: 'release-test',
				releaseBranchSha: 'aaaaaaa',
				developShaAtCut: 'bbbbbbb',
				developShaNow: 'ccccccc',
				releaseOnlyFixes: ['fix'],
				actor: 'agent',
			},
		);
		expect(receipt).toMatchObject({
			operation: 'reconcile',
			releaseSlug: 'release-test',
			status: 'planned',
			details: {
				reason: 'release fixes already present; no merge loop',
			},
		});
	});

	it('does not repeat reconciliation when release fixes are already present', async () => {
		const commands: string[][] = [];
		const receipt = await reconcileRelease(
			async (args) => {
				commands.push([...args]);
				return { ok: true, output: '' };
			},
			{
				releaseSlug: 'already-reconciled',
				releaseBranchSha: 'aaaaaaa',
				developShaAtCut: 'bbbbbbb',
				developShaNow: 'ccccccc',
				releaseOnlyFixes: ['fix'],
				actor: 'agent',
			},
		);
		expect(receipt).toMatchObject({ status: 'planned' });
		expect(commands).toHaveLength(2);
	});

	it('uses main as hotfix source and release/patch destination', () => {
		expect(
			createHotfixReceipt({
				slug: 'urgent-fix',
				source: 'main',
				actor: 'agent',
			}),
		).toMatchObject({ source: 'main', target: 'release/patch/urgent-fix' });
	});

	it('leaves abort and rollback receipts', () => {
		expect(abortRelease('cancelled', 'agent').status).toBe('aborted');
		expect(
			rollbackRelease('reverted', 'agent', 'aaaaaaa', 'bbbbbbb').status,
		).toBe('rolled-back');
	});
});
