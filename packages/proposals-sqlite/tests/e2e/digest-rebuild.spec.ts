import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { reconcileShadowToStaging } from '../../src';
import { largeProposalSet } from '../fixtures/large-proposal-set';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-digest-rebuild-'));

describe('rebuild digest parity (a00094 S1)', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('returns the same logical digest after deleting and rebuilding the active DB', () => {
		const rootDir = makeTmpDir();
		roots.push(rootDir);
		const statePath = join(rootDir, '.delendai', 'state');
		const activePath = join(statePath, 'proposals.sqlite');
		const files = largeProposalSet();
		const baseInput = {
			mode: 'shadow' as const,
			workspacePath: join(rootDir, 'workspace'),
			statePath,
			sourceCommit: 'fixture-commit',
			sha: 'fixture-tree',
			files,
		};

		const baseline = reconcileShadowToStaging({
			...baseInput,
			now: Date.parse('2026-09-07T12:00:00.000Z'),
		});
		expect(baseline.status).toBe('ok');
		expect(baseline.filesSeen).toBe(60);
		expect(existsSync(baseline.stagingPath)).toBe(true);
		renameSync(baseline.stagingPath, activePath);
		const digestBefore = baseline.stagingDigest;

		for (let iteration = 0; iteration < 100; iteration += 1) {
			rmSync(activePath, { force: true });
			const rebuilt = reconcileShadowToStaging({
				...baseInput,
				now: Date.parse('2026-09-07T12:00:00.000Z') + iteration + 1,
			});

			expect(rebuilt.status).toBe('ok');
			expect(rebuilt.integrity.status).toBe('ok');
			expect(rebuilt.foreignKey.status).toBe('ok');
			expect(rebuilt.stagingDigest).toBe(digestBefore);
			expect(existsSync(rebuilt.stagingPath)).toBe(true);
			renameSync(rebuilt.stagingPath, activePath);
		}
	}, 30_000);
});
