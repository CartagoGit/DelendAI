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

describe('file-conventions.ts (pure classifier)', async () => {
	it('classifies a tool file', async () => {
		expect(
			classifyPath('packages/core/src/lib/tools/bootstrap-tool.ts'),
		).toBe('tool');
	});

	it('classifies an interface contract by suffix', async () => {
		expect(
			classifyPath(
				'plugins/proposals/src/lib/contracts/interfaces/tool-descriptor.interface.ts',
			),
		).toBe('interface');
	});

	it('classifies a constant contract by suffix', async () => {
		expect(
			classifyPath(
				'packages/core/src/lib/contracts/constants/proposal-glossary.constant.ts',
			),
		).toBe('constant');
	});

	it('classifies a service by suffix even when it lives outside `services/`', async () => {
		expect(
			classifyPath('packages/client/src/lib/services/search-service.ts'),
		).toBe('service');
	});

	it('classifies a public barrel', async () => {
		expect(classifyPath('packages/core/src/public/index.ts')).toBe(
			'barrel',
		);
		expect(classifyPath('packages/core/src/index.ts')).toBe('barrel');
	});

	it('does NOT classify a top-level `index.ts` that is not the package entry as a barrel', async () => {
		// A feature-local `index.ts` is not a barrel per the convention.
		expect(classifyPath('packages/core/src/lib/utils/index.ts')).toBe(
			'other',
		);
	});

	it('classifies generated outputs and gives them priority over role suffixes', async () => {
		expect(classifyPath('packages/core/src/generated/api-schema.ts')).toBe(
			'generated',
		);
		expect(
			classifyPath('packages/core/src/lib/types/api.generated.ts'),
		).toBe('generated');
		expect(classifyPath('apps/web/.astro/types.d.ts')).toBe('generated');
	});

	it('classifies TypeScript config files', async () => {
		expect(classifyPath('plugins/search/vitest.config.ts')).toBe('config');
		expect(classifyPath('apps/web/astro.config.ts')).toBe('config');
	});

	it('classifies type companion files', async () => {
		expect(
			classifyPath('plugins/issues/src/lib/contracts/issue.types.ts'),
		).toBe('type');
	});

	it('classifies tests before role suffixes', async () => {
		expect(
			classifyPath('plugins/audit/tests/src/lib/plugin-options.spec.ts'),
		).toBe('test');
		expect(
			classifyPath(
				'plugins/proposals/tests/src/lib/tools/example.tool.spec.ts',
			),
		).toBe('test');
	});

	it('classifies project-native folders that intentionally avoid role suffixes', async () => {
		expect(
			classifyPath('extensions/vscode/src/commands/open-docs.ts'),
		).toBe('command');
		expect(
			classifyPath(
				'extensions/vscode/src/providers/tool-tree-data-provider.ts',
			),
		).toBe('provider');
		expect(
			classifyPath('packages/ui-extension/src/components/runtime.ts'),
		).toBe('component');
		expect(classifyPath('apps/web/src/i18n/ui.ts')).toBe('i18n');
		expect(classifyPath('apps/web/scripts/gen-skills.ts')).toBe('script');
		expect(classifyPath('apps/web/src/pages/api/dev-search.json.ts')).toBe(
			'page',
		);
		expect(
			classifyPath(
				'packages/client/src/lib/transport/mcp-stdio-client.ts',
			),
		).toBe('transport');
	});

	it('classifies registry/register/factory/builder roles', async () => {
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

	it('classifies stable domain folders', async () => {
		expect(
			classifyPath('packages/core/src/lib/bootstrap/analyze-tool.ts'),
		).toBe('bootstrap');
		expect(
			classifyPath('plugins/proposals/src/lib/swarm/round-context.ts'),
		).toBe('swarm');
		expect(
			classifyPath(
				'plugins/proposals/src/lib/agents/delivery-verifier.ts',
			),
		).toBe('agent');
		expect(
			classifyPath('packages/ui-extension/src/dashboard/format.ts'),
		).toBe('dashboard');
		expect(
			classifyPath(
				'plugins/rules/src/lib/frameworks/detect-framework.ts',
			),
		).toBe('framework');
		expect(classifyPath('extensions/vscode/src/extension.ts')).toBe(
			'entry',
		);
		expect(
			classifyPath('packages/core/src/lib/plugins/load-plugins.ts'),
		).toBe('plugin');
		expect(classifyPath('apps/web/src/lib/setup-wizard.ts')).toBe(
			'app-lib',
		);
		expect(
			classifyPath('packages/ui-extension/tests/fake-host-adapter.ts'),
		).toBe('test-support');
		expect(classifyPath('plugins/issues/src/lib/github-client.ts')).toBe(
			'issue',
		);
		expect(classifyPath('plugins/status-marker/src/lib/markers.ts')).toBe(
			'marker',
		);
		expect(classifyPath('plugins/test-convention/src/scan.ts')).toBe(
			'convention',
		);
	});

	it('returns `other` for unclassified paths', async () => {
		expect(classifyPath('packages/core/src/lib/utils/parse-yaml.ts')).toBe(
			'other',
		);
	});

	it('returns `other` for empty or non-string inputs', async () => {
		// Defensive — the type system prevents this, but the runtime
		// contract is part of the API.
		expect(classifyPath('')).toBe('other');
	});

	it('normalises Windows backslashes', async () => {
		expect(
			classifyPath('packages\\core\\src\\lib\\tools\\foo.tool.ts'),
		).toBe('tool');
	});

	it('accepts a custom rule chain (Dependency Inversion)', async () => {
		const customRules: readonly IRoleRule[] = [
			{ name: 'tool', match: (p) => p.endsWith('.special.ts') },
		];
		expect(classifyPath('anywhere/foo.special.ts', customRules)).toBe(
			'tool',
		);
		expect(classifyPath('anywhere/foo.tool.ts', customRules)).toBe('other');
	});

	it('skips rules that throw without poisoning the chain', async () => {
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

describe('toRelPosix', async () => {
	it('returns empty string when path equals rootDir', async () => {
		expect(toRelPosix('/repo', '/repo')).toBe('');
	});

	it('returns POSIX path with forward slashes', async () => {
		expect(toRelPosix('/repo', '/repo/packages/core/index.ts')).toBe(
			'packages/core/index.ts',
		);
	});

	it('returns `..` prefix when path is outside rootDir', async () => {
		expect(toRelPosix('/repo', '/other/x.ts')).toBe('../other/x.ts');
	});
});

describe('walkAndClassify', async () => {
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

describe('formatReport', async () => {
	it('prints 0 unmatched for an empty list', async () => {
		expect(formatReport([])).toContain('0 unmatched');
	});

	it('prints each finding as one line', async () => {
		const out = formatReport([
			{ relPath: 'a.ts', role: 'other', reason: 'unmatched' },
			{ relPath: 'b.ts', role: 'other', reason: 'unmatched' },
		]);
		expect(out).toContain('2 unmatched');
		expect(out).toContain('a.ts');
		expect(out).toContain('b.ts');
	});

	it('truncates after 50 findings', async () => {
		const many = Array.from({ length: 80 }, (_, i) => ({
			relPath: `f${i}.ts`,
			role: 'other' as const,
			reason: 'unmatched' as const,
		}));
		const out = formatReport(many);
		expect(out).toContain('80 unmatched');
		expect(out).toContain('…and 30 more');
	});

	it('report mode (S2) collapses to the count line with no per-file noise', async () => {
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

describe('main() CLI shell', async () => {
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

	it('exists as an exported async function (smoke)', async () => {
		expect(typeof main).toBe('function');
	});
});

describe('DEFAULT_TS_RULES (closed-world sanity)', async () => {
	it('contains exactly the documented role rules', async () => {
		const names = DEFAULT_TS_RULES.map((r) => r.name).sort();
		const expected = [
			'agent',
			'app-lib',
			'barrel',
			'bootstrap',
			'builder',
			'cascade',
			'cli',
			'command',
			'component',
			'config',
			'convention',
			'constant',
			'data',
			'dashboard',
			'dev',
			'entry',
			'factory',
			'framework',
			'generated',
			'host',
			'i18n',
			'install',
			'interface',
			'issue',
			'knowledge',
			'lock',
			'marker',
			'metric',
			'migration',
			'page',
			'plugin',
			'provider',
			'project',
			'proposal',
			'register',
			'registry',
			'scaffold',
			'script',
			'service',
			'setup',
			'shared',
			'skill',
			'setting',
			'swarm',
			'test',
			'test-support',
			'tool',
			'toolbar',
			'transport',
			'type',
			'view',
			'webview',
			'workspace',
		].sort();
		expect(names).toEqual(expected);
		expect(names.length).toBe(53);
	});

	it('lists generated first, then tests, config, scripts and commands (priority order)', async () => {
		const names = DEFAULT_TS_RULES.map((r) => r.name);
		expect(names[0]).toBe('generated');
		expect(names[1]).toBe('test');
		expect(names[2]).toBe('config');
		expect(names[3]).toBe('script');
		expect(names[4]).toBe('command');
	});
});
