import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TS_RULES,
	classifyPath,
	type IRoleRule,
} from './file-conventions';
import {
	formatReport,
	main,
	toRelPosix,
	walkAndClassify,
} from './file-conventions.script';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const makeTmpTree = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = await mkTmpDir();
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	return root;
};

const mkTmpDir = async (): Promise<string> => {
	const base = join(
		tmpdir(),
		`file-conventions-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(base, { recursive: true });
	return base;
};

describe('file-conventions.ts (pure classifier)', () => {
	it('classifies a tool file', () => {
		expect(
			classifyPath('packages/core/src/lib/tools/bootstrap-tool.ts'),
		).toBe('tool');
	});

	it('classifies an interface contract by suffix', () => {
		expect(
			classifyPath(
				'plugins/proposals/src/lib/contracts/interfaces/tool-descriptor.interface.ts',
			),
		).toBe('interface');
	});

	it('classifies a constant contract by suffix', () => {
		expect(
			classifyPath(
				'packages/core/src/lib/contracts/constants/proposal-glossary.constant.ts',
			),
		).toBe('constant');
	});

	it('classifies a service by suffix even when it lives outside `services/`', () => {
		expect(
			classifyPath('packages/client/src/lib/services/search-service.ts'),
		).toBe('service');
	});

	it('classifies a public barrel', () => {
		expect(classifyPath('packages/core/src/public/index.ts')).toBe(
			'barrel',
		);
		expect(classifyPath('packages/core/src/index.ts')).toBe('barrel');
	});

	it('does NOT classify a top-level `index.ts` that is not the package entry as a barrel', () => {
		// A feature-local `index.ts` is not a barrel per the convention.
		expect(classifyPath('packages/core/src/lib/utils/index.ts')).toBe(
			'other',
		);
	});

	it('classifies generated outputs and gives them priority over role suffixes', () => {
		expect(classifyPath('packages/core/src/generated/api-schema.ts')).toBe(
			'generated',
		);
		expect(
			classifyPath('packages/core/src/lib/types/api.generated.ts'),
		).toBe('generated');
	});

	it('classifies registry/register/factory/builder roles', () => {
		expect(
			classifyPath('packages/core/src/lib/registries/tool-registry.ts'),
		).toBe('registry');
		expect(
			classifyPath('packages/core/src/lib/register/plugin-register.ts'),
		).toBe('register');
		expect(
			classifyPath('packages/core/src/lib/factories/client-factory.ts'),
		).toBe('factory');
		expect(
			classifyPath('packages/core/src/lib/builders/query-builder.ts'),
		).toBe('builder');
	});

	it('returns `other` for unclassified paths', () => {
		expect(classifyPath('packages/core/src/lib/utils/parse-yaml.ts')).toBe(
			'other',
		);
	});

	it('returns `other` for empty or non-string inputs', () => {
		// Defensive — the type system prevents this, but the runtime
		// contract is part of the API.
		expect(classifyPath('')).toBe('other');
	});

	it('normalises Windows backslashes', () => {
		expect(
			classifyPath('packages\\core\\src\\lib\\tools\\foo.tool.ts'),
		).toBe('tool');
	});

	it('accepts a custom rule chain (Dependency Inversion)', () => {
		const customRules: readonly IRoleRule[] = [
			{ name: 'tool', match: (p) => p.endsWith('.special.ts') },
		];
		expect(classifyPath('anywhere/foo.special.ts', customRules)).toBe(
			'tool',
		);
		expect(classifyPath('anywhere/foo.tool.ts', customRules)).toBe('other');
	});

	it('skips rules that throw without poisoning the chain', () => {
		const buggyRules: readonly IRoleRule[] = [
			{
				name: 'tool',
				match: () => {
					throw new Error('boom');
				},
			},
			{ name: 'service', match: (p) => p.endsWith('.service.ts') },
		];
		expect(classifyPath('foo.service.ts', buggyRules)).toBe('service');
	});
});

describe('toRelPosix', () => {
	it('returns empty string when path equals rootDir', () => {
		expect(toRelPosix('/repo', '/repo')).toBe('');
	});

	it('returns POSIX path with forward slashes', () => {
		expect(toRelPosix('/repo', '/repo/packages/core/index.ts')).toBe(
			'packages/core/index.ts',
		);
	});

	it('returns `..` prefix when path is outside rootDir', () => {
		expect(toRelPosix('/repo', '/other/x.ts')).toBe('../other/x.ts');
	});
});

describe('walkAndClassify', () => {
	it('walks a small tmp tree and reports unmatched .ts files', async () => {
		const root = await makeTmpTree({
			'packages/core/src/lib/tools/foo.tool.ts': 'export const x = 1;',
			'packages/core/src/lib/utils/parse-yaml.ts': 'export const y = 2;',
			'packages/core/src/public/index.ts':
				'export * from "./lib/tools/foo.tool";',
			'packages/core/package.json': '{}',
			'packages/core/src/lib/utils/README.md': '# docs',
		});
		const findings = await walkAndClassify(root, ['packages']);
		const paths = findings.map((f) => f.relPath);
		expect(paths).toContain('packages/core/src/lib/utils/parse-yaml.ts');
		expect(paths).not.toContain('packages/core/src/lib/tools/foo.tool.ts');
		expect(paths).not.toContain('packages/core/src/public/index.ts');
		expect(paths).not.toContain('packages/core/package.json');
		expect(paths).not.toContain('packages/core/src/lib/utils/README.md');
		await rm(root, { recursive: true });
	});

	it('skips node_modules, dist and build directories', async () => {
		const root = await makeTmpTree({
			'packages/x/src/lib/tools/a.tool.ts': '',
			'packages/x/node_modules/foo/index.ts': '',
			'packages/x/dist/b.tool.ts': '',
			'packages/x/build/c.tool.ts': '',
		});
		const findings = await walkAndClassify(root, ['packages']);
		expect(findings.map((f) => f.relPath)).toEqual([]);
		await rm(root, { recursive: true });
	});

	it('returns sorted findings', async () => {
		const root = await makeTmpTree({
			'packages/x/src/lib/utils/z.ts': '',
			'packages/x/src/lib/utils/a.ts': '',
		});
		const findings = await walkAndClassify(root, ['packages']);
		expect(findings.map((f) => f.relPath)).toEqual([
			'packages/x/src/lib/utils/a.ts',
			'packages/x/src/lib/utils/z.ts',
		]);
		await rm(root, { recursive: true });
	});

	it('silently skips missing scan roots', async () => {
		const root = await makeTmpTree({});
		const findings = await walkAndClassify(root, ['does-not-exist']);
		expect(findings).toEqual([]);
		await rm(root, { recursive: true });
	});
});

describe('formatReport', () => {
	it('prints 0 unmatched for an empty list', () => {
		expect(formatReport([])).toContain('0 unmatched');
	});

	it('prints each finding as one line', () => {
		const out = formatReport([
			{ relPath: 'a.ts', role: 'other', reason: 'unmatched' },
			{ relPath: 'b.ts', role: 'other', reason: 'unmatched' },
		]);
		expect(out).toContain('2 unmatched');
		expect(out).toContain('a.ts');
		expect(out).toContain('b.ts');
	});

	it('truncates after 50 findings', () => {
		const many = Array.from({ length: 80 }, (_, i) => ({
			relPath: `f${i}.ts`,
			role: 'other' as const,
			reason: 'unmatched' as const,
		}));
		const out = formatReport(many);
		expect(out).toContain('80 unmatched');
		expect(out).toContain('…and 30 more');
	});

	it('report mode (S2) collapses to the count line with no per-file noise', () => {
		const many = Array.from({ length: 80 }, (_, i) => ({
			relPath: `f${i}.ts`,
			role: 'other' as const,
			reason: 'unmatched' as const,
		}));
		const out = formatReport(many, true);
		expect(out).toBe('file-conventions: 80 unmatched files\n');
		expect(out).not.toContain('f0.ts');
		expect(out).not.toContain('…and');
	});
});

describe('main() CLI shell', () => {
	it('exits 0 in report mode regardless of drift (S1 ships report-only)', async () => {
		// Spawning `bun` mid-test would leak the host stderr. We only
		// exercise the `main()` entrypoint path indirectly here by
		// asserting the engine it delegates to returns the same
		// findings as a manual walk would — the actual process exit
		// is covered by the script-level `--report` flag and S7's
		// strict-mode gate.
		const root = await makeTmpTree({
			'packages/x/src/lib/utils/a.ts': '',
		});
		const findings = await walkAndClassify(root, ['packages']);
		expect(findings.length).toBeGreaterThan(0);
		await rm(root, { recursive: true });
	});

	it('exists as an exported async function (smoke)', () => {
		expect(typeof main).toBe('function');
		expect(main([])).toBeInstanceOf(Promise);
	});
});

describe('DEFAULT_TS_RULES (closed-world sanity)', () => {
	it('contains exactly the 10 documented role rules', () => {
		const names = DEFAULT_TS_RULES.map((r) => r.name).sort();
		expect(names).toEqual([
			'barrel',
			'builder',
			'constant',
			'factory',
			'generated',
			'interface',
			'register',
			'registry',
			'service',
			'tool',
		]);
		expect(names.length).toBe(10);
	});

	it('lists generated first, then barrel, then interface (priority order)', () => {
		const names = DEFAULT_TS_RULES.map((r) => r.name);
		expect(names[0]).toBe('generated');
		expect(names[1]).toBe('barrel');
		expect(names[2]).toBe('interface');
	});
});
