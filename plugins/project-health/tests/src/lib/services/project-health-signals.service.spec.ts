/**
 * project-health-signals.service.spec.ts — a summary built from presence
 * heuristics never scores an axis 100, and says how much it rests on.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROJECT_HEALTH_INFERRED_CEILING } from '../../../../src/lib/contracts/constants/project-health.constant';
import { summarizeSignals } from '../../../../src/lib/services/project-health-signals.service';

const roots: string[] = [];

const workspace = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'health-signals-'));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
};

const summarize = async (root: string) =>
	(
		await summarizeSignals({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 8000,
		})
	).score;

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

describe('summarizeSignals', () => {
	it('keeps every axis under 100 even when every presence signal is there', async () => {
		const root = await workspace({
			'bun.lock': '',
			'package.json': JSON.stringify({
				scripts: { lint: 'biome check', test: 'vitest run' },
			}),
			'biome.json': '{}',
			'vitest.config.ts': 'export default {};',
			'src/index.ts': 'export const a = 1;\n',
		});
		const score = await summarize(root);
		for (const axis of [
			score.security,
			score.deps,
			score.quality,
			score.debt,
		])
			expect(axis).toBeLessThanOrEqual(PROJECT_HEALTH_INFERRED_CEILING);
		expect(score.confidence).toBe('medium');
	});

	it('is low confidence when a signal is missing', async () => {
		const score = await summarize(
			await workspace({ 'README.md': '# x\n' }),
		);
		expect(score.confidence).toBe('low');
		expect(score.deps).toBeLessThan(PROJECT_HEALTH_INFERRED_CEILING);
	});
});
