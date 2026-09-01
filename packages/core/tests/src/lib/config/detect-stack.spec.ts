/**
 * detect-stack.spec.ts — r00011 S2 acceptance: pure stack auto-detection
 * ranks web-app / backend-api / cli-tool / library / monorepo / data
 * from injected manifest + config-file signals, never reads disk,
 * and abstains with `unknown` when nothing matches.
 */
import { describe, expect, it } from 'vitest';

import {
	detectStack,
	MANIFEST_FILES,
} from '@mcp-vertex/core/lib/config/detect-stack';
import type { IStackProbeDeps } from '@mcp-vertex/core/lib/contracts/interfaces/stack-detection.interface';

const pkg = (deps: Record<string, string>): unknown => ({
	dependencies: deps,
	devDependencies: {},
	scripts: {},
});

const globToRegExp = (glob: string): RegExp => {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const pattern = escaped
		.replaceAll('*', '[^/]*')
		.replaceAll('{', '{')
		.replaceAll('}', '}');
	if (pattern.includes('{') && pattern.includes('}')) {
		const alternation = pattern.replace(
			/\{([^}]+)\}/g,
			(_match, inner) => `(${String(inner).split(',').join('|')})`,
		);
		return new RegExp(`^${alternation}$`);
	}
	return new RegExp(`^${pattern}$`);
};

const makeDeps = (over: {
	pkg?: unknown | null;
	pyproject?: string | null;
	requirements?: string | null;
	cargo?: string | null;
	gomod?: string | null;
	files?: readonly string[];
}): IStackProbeDeps => {
	const fs = over.files ?? [];
	return {
		readJson: async (path) => {
			if (path.endsWith('package.json')) return over.pkg ?? null;
			return null;
		},
		readText: async (path) => {
			if (path.endsWith('pyproject.toml')) return over.pyproject ?? null;
			if (path.endsWith('requirements.txt'))
				return over.requirements ?? null;
			if (path.endsWith('Cargo.toml')) return over.cargo ?? null;
			if (path.endsWith('go.mod')) return over.gomod ?? null;
			return null;
		},
		listFiles: (_root, globs) => {
			const matchers = globs.map(globToRegExp);
			return fs.filter((path) =>
				matchers.some((matcher) => matcher.test(path)),
			);
		},
	};
};

describe('detectStack', () => {
	it('returns unknown when nothing matches', async () => {
		const deps = makeDeps({});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('unknown');
		expect(r.recommendations).toEqual([]);
		expect(r.defaults).toEqual({
			packageManager: 'unknown',
			language: 'unknown',
			testRunner: 'unknown',
			lintCommand: undefined,
			typecheckCommand: undefined,
			docsRoots: [],
			sourceRoots: [],
		});
	});

	it('detects Astro as web-app', async () => {
		const deps = makeDeps({
			pkg: {
				dependencies: {
					astro: '^4.0.0',
					typescript: '^5.0.0',
					vitest: '^2.0.0',
				},
				devDependencies: {},
				scripts: {
					lint: 'biome check .',
					typecheck: 'tsc --noEmit',
					test: 'vitest run',
				},
			},
			files: [
				'astro.config.mjs',
				'bun.lock',
				'src',
				'docs',
				'README.md',
				'tsconfig.json',
			],
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('web-app');
		expect(r.detectedFrameworks).toContain('Astro');
		expect(r.defaults).toEqual({
			packageManager: 'bun',
			language: 'typescript',
			testRunner: 'vitest',
			lintCommand: 'bun run lint',
			typecheckCommand: 'bun run typecheck',
			docsRoots: ['docs', 'README.md'],
			sourceRoots: ['src'],
		});
		const web = r.recommendations.find((c) => c.pack === 'web-app');
		expect(web).toBeDefined();
		expect(web?.reasons.some((reason) => reason.includes('Astro'))).toBe(
			true,
		);
	});

	it('detects pnpm-backed script commands without assuming bun', async () => {
		const deps = makeDeps({
			pkg: {
				dependencies: { typescript: '^5.0.0', vitest: '^2.0.0' },
				devDependencies: {},
				scripts: {
					lint: 'eslint .',
					'type-check': 'tsc --noEmit',
					test: 'vitest run',
				},
			},
			files: [
				'pnpm-lock.yaml',
				'src',
				'docs',
				'README.md',
				'tsconfig.json',
			],
		});
		const r = await detectStack('/w', deps);
		expect(r.defaults).toEqual({
			packageManager: 'pnpm',
			language: 'typescript',
			testRunner: 'vitest',
			lintCommand: 'pnpm lint',
			typecheckCommand: 'pnpm type-check',
			docsRoots: ['docs', 'README.md'],
			sourceRoots: ['src'],
		});
	});

	it('detects Next.js as web-app', async () => {
		const deps = makeDeps({
			pkg: pkg({ next: '^14.0.0' }),
			files: ['next.config.js'],
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('web-app');
		expect(r.detectedFrameworks).toContain('Next.js');
	});

	it('detects NestJS + Prisma as backend-api', async () => {
		const deps = makeDeps({
			pkg: pkg({ '@nestjs/core': '^10.0.0', prisma: '^5.0.0' }),
			files: ['nest-cli.json', 'prisma/schema.prisma'],
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('backend-api');
		expect(r.detectedFrameworks).toContain('NestJS');
	});

	it('detects oclif as cli-tool', async () => {
		const deps = makeDeps({ pkg: pkg({ '@oclif/core': '^4.0.0' }) });
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('cli-tool');
		expect(r.detectedFrameworks).toContain('oclif');
	});

	it('detects Rust bin target as cli-tool', async () => {
		const deps = makeDeps({
			cargo: '[package]\nname = "x"\n[[bin]]\nname = "x"\npath = "src/main.rs"',
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('cli-tool');
	});

	it('detects Go cobra as cli-tool', async () => {
		const deps = makeDeps({
			gomod: 'module x\nrequire github.com/spf13/cobra v1.0.0',
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('cli-tool');
	});

	it('detects FastAPI as backend-api (python)', async () => {
		const deps = makeDeps({
			requirements:
				'fastapi==0.110.0\nuvicorn==0.27.0\npytest==8.0.0\nruff==0.6.0\nmypy==1.11.0',
			files: ['src', 'docs'],
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('backend-api');
		expect(r.detectedFrameworks).toContain('FastAPI');
		expect(r.defaults).toEqual({
			packageManager: 'unknown',
			language: 'python',
			testRunner: 'pytest',
			lintCommand: 'ruff check .',
			typecheckCommand: 'mypy .',
			docsRoots: ['docs'],
			sourceRoots: ['src'],
		});
	});

	it('detects a workspaces field as monorepo', async () => {
		const deps = makeDeps({
			pkg: { workspaces: ['packages/*'] },
			files: ['packages/a/package.json', 'packages/b/package.json'],
		});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('monorepo');
	});

	it('detects a TS package with no runtime framework as library', async () => {
		const deps = makeDeps({ pkg: pkg({ typescript: '^5.0.0' }) });
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('library');
	});

	it('abstains when only the manifest is empty + no config files', async () => {
		const deps = makeDeps({});
		const r = await detectStack('/w', deps);
		expect(r.top).toBe('unknown');
		expect(r.recommendations).toEqual([]);
	});

	it('never touches the filesystem (deps are pure)', async () => {
		let reads = 0;
		const deps: IStackProbeDeps = {
			readJson: async () => {
				reads += 1;
				return null;
			},
			readText: async () => {
				reads += 1;
				return null;
			},
			listFiles: () => {
				reads += 1;
				return [];
			},
		};
		await detectStack('/w', deps);
		expect(reads).toBeGreaterThan(0);
	});

	it('exports the manifest-file list for callers', () => {
		expect(MANIFEST_FILES).toContain('package.json');
		expect(MANIFEST_FILES).toContain('Cargo.toml');
	});
});
