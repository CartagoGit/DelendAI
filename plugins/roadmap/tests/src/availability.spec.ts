/**
 * availability.spec.ts — the roadmap plugin says whether it can work here.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('roadmap availability', () => {
	it('says what it is missing when it cannot work', async () => {
		const answer = await availability(
			fakePartial<Context>({ options: {} }),
		);
		expect(answer?.state).toBe('needs-configuration');
		expect(answer?.missing).toBeDefined();
		expect(answer?.fix).toBeDefined();
	});

	it('is registered once it has what it needs', async () => {
		expect(
			(
				await availability(
					fakePartial<Context>({ options: { file: 'ROADMAP.md' } }),
				)
			)?.state,
		).toBe('registered');
	});

	it('proves a declared roadmap by reading it, and fails when it is not there', async () => {
		const root = mkdtempSync(join(tmpdir(), 'roadmap-probe-'));
		try {
			writeFileSync(join(root, 'ROADMAP.md'), '# Roadmap\n');
			const ctxWith = (file: string) =>
				fakePartial<Context>({
					options: { file },
					workspace: fakePartial<Context['workspace']>({ root }),
				});
			await expect(
				plugin.probe?.(ctxWith('ROADMAP.md')),
			).resolves.toBeUndefined();
			await expect(
				plugin.probe?.(ctxWith('MISSING.md')),
			).rejects.toThrow();
			await expect(
				plugin.probe?.(fakePartial<Context>({ options: {} })),
			).resolves.toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
