/**
 * reconciler-run.service.spec.ts — each event starts exactly one pass.
 */
import { describe, expect, it } from 'vitest';

import {
	RECONCILER_SCRIPT,
	RECONCILE_TRIGGERS,
} from '@delendai/core/lib/contracts/constants/ref-kinds.constant';
import { startReconcilerPass } from '@delendai/core/lib/ref-reconciler/reconciler-run.service';

const ports = (exists = true) => {
	const launched: (readonly string[])[] = [];
	return {
		launched,
		ports: {
			exists: () => Promise.resolve(exists),
			spawn: (_script: string, args: readonly string[]) => {
				launched.push(args);
			},
		},
	};
};

describe('startReconcilerPass', () => {
	it.each(RECONCILE_TRIGGERS)(
		'[<200ms] %s starts exactly one pass of the repository script',
		async (trigger) => {
			const fake = ports();
			expect(
				await startReconcilerPass(trigger, '/repo', fake.ports),
			).toBe('started');
			expect(fake.launched).toEqual([
				['--apply', `--trigger=${trigger}`],
			]);
		},
	);

	it('[<200ms] starts nothing in a repository without the script', async () => {
		const fake = ports(false);
		expect(
			await startReconcilerPass('work-retire', '/repo', fake.ports),
		).toBe('skipped');
		expect(fake.launched).toEqual([]);
	});

	it('[<200ms] never throws when launching fails', async () => {
		const failing = {
			exists: () => Promise.resolve(true),
			spawn: () => {
				throw new Error('no bun');
			},
		};
		expect(
			await startReconcilerPass('work-deliver', '/repo', failing),
		).toBe('skipped');
	});

	it('[<200ms] names the script the repository ships', () => {
		expect(RECONCILER_SCRIPT).toBe(
			'tools/scripts/forge/reconcile-refs.script.ts',
		);
	});
});
