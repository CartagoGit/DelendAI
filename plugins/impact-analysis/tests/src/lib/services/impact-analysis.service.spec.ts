import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildCoverageFocus,
	computeImpactAnalysis,
	inferRisk,
	selectSkipSample,
} from '../../../../src/lib/services/impact-analysis.service';

describe('impact-analysis.service', () => {
	it('unit > inferRisk > returns high when packages/core is affected', () => {
		const risk = inferRisk(['packages/core', 'plugins/demo'], []);

		expect(risk).toBe('high');
	});

	it('unit > selectSkipSample > excludes scheduled tests and caps the sample', () => {
		const skip = selectSkipSample(
			[
				'a.spec.ts',
				'b.spec.ts',
				'c.spec.ts',
				'd.spec.ts',
				'e.spec.ts',
				'f.spec.ts',
				'g.spec.ts',
			],
			['b.spec.ts', 'e.spec.ts'],
		);

		expect(skip).not.toContain('b.spec.ts');
		expect(skip).not.toContain('e.spec.ts');
		expect(skip.length).toBeLessThanOrEqual(6);
		expect(skip).toEqual([
			'a.spec.ts',
			'c.spec.ts',
			'd.spec.ts',
			'f.spec.ts',
			'g.spec.ts',
		]);
	});

	it('unit > buildCoverageFocus > prefers affected packages, then falls back to run package scopes', () => {
		expect(
			buildCoverageFocus(
				['plugins/demo', 'packages/core'],
				['tools/tests/a.spec.ts'],
			),
		).toEqual(['plugins/demo', 'packages/core']);
		expect(
			buildCoverageFocus(
				[],
				[
					'packages/core/tests/src/foo.spec.ts',
					'plugins/demo/tests/src/demo.spec.ts',
					'tools/tests/a.spec.ts',
				],
			),
		).toEqual(['packages/core', 'plugins/demo', 'tools']);
	});

	describe('anchors', () => {
		const roots: string[] = [];
		afterEach(async () => {
			for (const root of roots.splice(0))
				await rm(root, { recursive: true, force: true });
		});

		/** A repository with one committed file and another change in progress. */
		const dirtyRepo = async (): Promise<string> => {
			const root = await mkdtemp(join(tmpdir(), 'impact-anchors-'));
			roots.push(root);
			await mkdir(join(root, 'src'), { recursive: true });
			await writeFile(
				join(root, 'src/named.ts'),
				'export const named = 1;\n',
			);
			const git = (...args: string[]): void => {
				execFileSync(
					'git',
					['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
					{ cwd: root, stdio: 'ignore' },
				);
			};
			git('init', '-q');
			git('add', '.');
			git('commit', '-q', '-m', 'init');
			await writeFile(
				join(root, 'src/elsewhere.ts'),
				'export const elsewhere = 2;\n',
			);
			return root;
		};
		const options = (root: string) => ({
			namespacePrefix: 'delendai',
			workspaceRootAbs: root,
			maxBytes: 4000,
		});

		it('keeps a named slice to itself, without the working tree', async () => {
			const root = await dirtyRepo();
			const analysis = await computeImpactAnalysis(
				{ files: ['src/named.ts'] },
				options(root),
			);
			expect(analysis.changedSymbols).toContain('named');
			expect(analysis.changedSymbols).not.toContain('elsewhere');
		});

		it('reads the working tree when nothing is named', async () => {
			const root = await dirtyRepo();
			const analysis = await computeImpactAnalysis({}, options(root));
			expect(analysis.changedSymbols).toContain('elsewhere');
		});
	});
});
