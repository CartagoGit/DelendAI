import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	detectInternalCoreImports,
	detectPrivateDependencies,
	detectPublicationBoundaryViolations,
	formatBoundaryReport,
	formatReport,
	publicationBoundaryReason,
	readWorkspacePackages,
	scanText,
	splitSpecifier,
	stripTemplateLiterals,
	type IWorkspacePackage,
} from './no-internal-core-imports.script';

describe('no-internal-core-imports.script', async () => {
	it('allows the public core entrypoint', async () => {
		const findings = scanText(
			'import { runCli } from "@delendai/core/public";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('flags package imports from core lib internals', async () => {
		const findings = scanText(
			'import { x } from "@delendai/core/lib/plugins";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('@delendai/core/lib/plugins');
		expect(findings[0]?.reason).toContain('@delendai/core/public');
	});

	it('flags package imports from core dist output', async () => {
		const findings = scanText(
			'export { x } from "@delendai/core/dist/public";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('@delendai/core/dist/public');
	});

	it('flags relative imports into packages/core/src/lib', async () => {
		const findings = scanText(
			'import { x } from "../../../packages/core/src/lib/bootstrap";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toContain('packages/core/src/lib');
	});

	it('flags relative imports through ../../core/src/lib', async () => {
		const findings = scanText(
			'import { x } from "../../core/src/lib/bootstrap";\n',
			'/repo/packages/cli/src/index.ts',
			'packages/cli/src/index.ts',
		);
		expect(findings[0]?.specifier).toBe('../../core/src/lib/bootstrap');
	});

	it('detects violations under a temporary CLI source tree', async () => {
		const root = await makeTmpTree({
			'index.ts': 'import { x } from "@delendai/core/lib/bootstrap";\n',
			'nested/ok.ts': 'import { runCli } from "@delendai/core/public";\n',
		});
		const findings = await detectInternalCoreImports(root);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.specifier).toBe('@delendai/core/lib/bootstrap');
		await rm(root, { recursive: true });
	});

	it('formatReport prints actionable rows', async () => {
		const out = formatReport([
			{
				absPath: '/repo/packages/cli/src/index.ts',
				relPath: 'packages/cli/src/index.ts',
				line: 3,
				specifier: '@delendai/core/lib/bootstrap',
				reason: 'use @delendai/core/public',
			},
		]);
		expect(out).toContain('1 violation');
		expect(out).toContain('packages/cli/src/index.ts:3');
		expect(out).toContain('@delendai/core/public');
	});
});

const makeTmpTree = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = join(
		tmpdir(),
		`no-internal-core-imports-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	return root;
};


/* x00530 S3 — publication-boundary half. */

const pkg = (
	dir: string,
	name: string,
	manifest: Record<string, unknown> = {},
): IWorkspacePackage => ({
	dir,
	name,
	manifest: { name, ...manifest },
});

const publicCore = pkg('packages/core', '@delendai/core', {
	exports: {
		'.': { import: './dist/index.js', types: './dist/index.d.ts' },
		'./public': {
			import: './dist/public/index.js',
			types: './dist/public/index.d.ts',
		},
	},
});

const privateState = pkg('packages/state', '@delendai/state', {
	private: true,
	exports: { '.': { import: './dist/index.js' } },
});

const typesOnly = pkg('plugins/commit-policy', '@delendai/commit-policy', {
	exports: {
		'./public': { import: './dist/public/index.js' },
		'./lib/services/storm-detector': {
			types: './dist/lib/services/storm-detector.d.ts',
		},
	},
});

const world = new Map<string, IWorkspacePackage>([
	[publicCore.name, publicCore],
	[privateState.name, privateState],
	[typesOnly.name, typesOnly],
]);

describe('publication boundary', () => {
	it('splits a scoped specifier into package + exports subpath', () => {
		expect(splitSpecifier('@delendai/core')).toEqual({
			pkg: '@delendai/core',
			subpath: '.',
		});
		expect(splitSpecifier('@delendai/core/lib/plugins/x')).toEqual({
			pkg: '@delendai/core',
			subpath: './lib/plugins/x',
		});
		expect(splitSpecifier('node:fs')).toBeUndefined();
	});

	it('accepts a declared, runtime-resolvable subpath', () => {
		expect(
			publicationBoundaryReason(
				'@delendai/core/public',
				world,
				'@delendai/proposals',
			),
		).toBeUndefined();
	});

	it('rejects an undeclared subpath of a published package', () => {
		const reason = publicationBoundaryReason(
			'@delendai/core/lib/adopt/adoption-extension-registry',
			world,
			'@delendai/proposals',
		);
		expect(reason).toContain('does not declare');
		expect(reason).toContain('./lib/adopt/adoption-extension-registry');
	});

	it('rejects any import of a private package', () => {
		const reason = publicationBoundaryReason(
			'@delendai/state',
			world,
			'@delendai/core',
		);
		expect(reason).toContain('"private": true');
	});

	it('rejects a subpath declared with types but no runtime condition', () => {
		const reason = publicationBoundaryReason(
			'@delendai/commit-policy/lib/services/storm-detector',
			world,
			'@delendai/error-reporting',
		);
		expect(reason).toContain('no runtime condition');
	});

	it('ignores packages outside the workspace', () => {
		expect(
			publicationBoundaryReason('@delendai/never-existed', world, '@x/y'),
		).toBeUndefined();
	});

	it('blanks template literals while preserving line numbers', () => {
		const source = [
			"import { a } from '@delendai/core/public';",
			'const emitted = `',
			"import { b } from '@delendai/ui-extension/public';",
			'`;',
		].join('\n');
		const stripped = stripTemplateLiterals(source);
		expect(stripped.split('\n')).toHaveLength(4);
		expect(stripped).toContain('@delendai/core/public');
		expect(stripped).not.toContain('@delendai/ui-extension/public');
	});

	it('the repo itself has no private dependency in PUBLISH_ORDER', async () => {
		expect(await detectPrivateDependencies()).toEqual([]);
	});

	it('the repo itself has no cross-package boundary violation', async () => {
		expect(await detectPublicationBoundaryViolations()).toEqual([]);
	});

	it('reads every workspace manifest by package name', async () => {
		const packages = await readWorkspacePackages();
		expect(packages.get('@delendai/core')?.dir).toBe('packages/core');
		expect(packages.get('@delendai/state')?.manifest.private).toBeUndefined();
	});

	it('formats an empty boundary report', () => {
		expect(formatBoundaryReport([])).toContain('0 violations');
	});
});
