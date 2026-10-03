/**
 * tsconfig-paths-coverage.spec.ts
 *
 * Exercises `lintTsconfigPathsCoverage` against hermetic fixture
 * repos (mkdtemp'd, never the real monorepo) so the gate's four
 * violation classes — missing entry, wrong target, stale on-disk
 * target, and orphaned/renamed package — are each covered
 * independently, plus the documented alias exception
 * (`@delendai/ide` for `@delendai/ui-extension`) that must NOT
 * be flagged as an orphan.
 *
 * The real tree is covered by the gate itself running as
 * `lint:tsconfig-paths-coverage` in `validate`.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { lintTsconfigPathsCoverage } from '../../scripts/lint/tsconfig-paths-coverage.script';

const writeJson = async (path: string, value: unknown): Promise<void> => {
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
};

interface IFixtureOptions {
	/** Override/replace the fixture's `tsconfig.base.json#compilerOptions.paths`. */
	readonly paths: Readonly<Record<string, readonly string[]>>;
	/** Skip writing `packages/foo/src/public/index.ts` to simulate a stale disk target. */
	readonly skipPublicFile?: boolean;
}

/**
 * A minimal two-package fixture: `@delendai/foo` (main + `./public`
 * exports, so it needs all three `paths` entries) mirrors the
 * general-purpose plugin shape used across the real repo.
 */
const buildFixture = async (options: IFixtureOptions): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'tsconfig-paths-coverage-'));
	await writeJson(join(root, 'package.json'), {
		name: '@fixture/root',
		workspaces: ['packages/*'],
	});
	await mkdir(join(root, 'packages/foo/src/public'), { recursive: true });
	await writeJson(join(root, 'packages/foo/package.json'), {
		name: '@delendai/foo',
		exports: {
			'.': { types: './src/index.ts' },
			'./public': { types: './src/public/index.ts' },
		},
	});
	await writeFile(join(root, 'packages/foo/src/index.ts'), 'export {};\n');
	if (options.skipPublicFile !== true) {
		await writeFile(
			join(root, 'packages/foo/src/public/index.ts'),
			'export {};\n',
		);
	}
	await writeJson(join(root, 'tsconfig.base.json'), {
		compilerOptions: { paths: options.paths },
	});
	return root;
};

const validPaths: Record<string, readonly string[]> = {
	'@delendai/foo': ['./packages/foo/src/index.ts'],
	'@delendai/foo/public': ['./packages/foo/src/public/index.ts'],
	'@delendai/foo/*': ['./packages/foo/src/*'],
};

describe('tsconfig-paths-coverage lint', () => {
	const roots: string[] = [];
	afterEach(async () => {
		while (roots.length > 0) {
			const root = roots.pop();
			if (root !== undefined)
				await rm(root, { recursive: true, force: true });
		}
	});
	const track = (root: string): string => {
		roots.push(root);
		return root;
	};

	it('passes when every required entry is present, correct, and on disk', async () => {
		const root = track(await buildFixture({ paths: validPaths }));
		expect(await lintTsconfigPathsCoverage(root)).toEqual([]);
	});

	it('flags a missing entry (the agent-orchestrator regression shape)', async () => {
		const withoutFoo = { ...validPaths };
		delete withoutFoo['@delendai/foo'];
		const root = track(await buildFixture({ paths: withoutFoo }));
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.some(
				(v) =>
					v.rule === 'TSPATH-MISSING-001' &&
					v.key === '@delendai/foo',
			),
		).toBe(true);
	});

	it('flags an entry pointing at the wrong target', async () => {
		const root = track(
			await buildFixture({
				paths: {
					...validPaths,
					'@delendai/foo': ['./packages/foo/dist/index.js'],
				},
			}),
		);
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.some(
				(v) =>
					v.rule === 'TSPATH-MISMATCH-001' &&
					v.key === '@delendai/foo',
			),
		).toBe(true);
	});

	it('flags an entry whose on-disk target does not exist', async () => {
		const root = track(
			await buildFixture({ paths: validPaths, skipPublicFile: true }),
		);
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.some(
				(v) =>
					v.rule === 'TSPATH-STALE-TARGET-001' &&
					v.key === '@delendai/foo/public',
			),
		).toBe(true);
	});

	it('flags an orphaned entry for a package that no longer exists', async () => {
		const root = track(
			await buildFixture({
				paths: {
					...validPaths,
					'@delendai/removed': ['./packages/removed/src/index.ts'],
				},
			}),
		);
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.some(
				(v) =>
					v.rule === 'TSPATH-ORPHAN-001' &&
					v.key === '@delendai/removed',
			),
		).toBe(true);
	});

	it('does not flag a legacy alias whose targets exactly match a real package', async () => {
		const root = track(
			await buildFixture({
				paths: {
					...validPaths,
					'@delendai/legacy-foo': ['./packages/foo/src/index.ts'],
					'@delendai/legacy-foo/public': [
						'./packages/foo/src/public/index.ts',
					],
					'@delendai/legacy-foo/*': ['./packages/foo/src/*'],
				},
			}),
		);
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.filter((v) => v.rule === 'TSPATH-ORPHAN-001'),
		).toEqual([]);
	});

	it('does flag an alias-shaped entry whose target diverges from every real package', async () => {
		const root = track(
			await buildFixture({
				paths: {
					...validPaths,
					'@delendai/almost-foo': [
						'./packages/somewhere-else/src/index.ts',
					],
				},
			}),
		);
		const violations = await lintTsconfigPathsCoverage(root);
		expect(
			violations.some(
				(v) =>
					v.rule === 'TSPATH-ORPHAN-001' &&
					v.key === '@delendai/almost-foo',
			),
		).toBe(true);
	});

	it('does not require a "./public" entry for a package that never exports one', async () => {
		const root = await mkdtemp(join(tmpdir(), 'tsconfig-paths-coverage-'));
		roots.push(root);
		await writeJson(join(root, 'package.json'), {
			name: '@fixture/root',
			workspaces: ['packages/*'],
		});
		await mkdir(join(root, 'packages/bare/src'), { recursive: true });
		await writeJson(join(root, 'packages/bare/package.json'), {
			name: '@delendai/bare',
			exports: { '.': { types: './src/index.ts' } },
		});
		await writeFile(
			join(root, 'packages/bare/src/index.ts'),
			'export {};\n',
		);
		await writeJson(join(root, 'tsconfig.base.json'), {
			compilerOptions: {
				paths: {
					'@delendai/bare': ['./packages/bare/src/index.ts'],
					'@delendai/bare/*': ['./packages/bare/src/*'],
				},
			},
		});
		expect(await lintTsconfigPathsCoverage(root)).toEqual([]);
	});
});
