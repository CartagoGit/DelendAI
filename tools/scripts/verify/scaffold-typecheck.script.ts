#!/usr/bin/env bun
/**
 * scaffold-typecheck.script.ts — a00067 (from-scratch onboarding).
 *
 * `create_project` hands an adopter the files for a brand-new host server,
 * plugin, client, or extension host. Every existing test asserts the shape
 * of those files (paths + strings); NONE compiles them. So a drift between
 * a scaffold template's imports and the SHIPPED `@mcp-vertex/*` public API
 * — a renamed export, a changed signature — passes every gate and only
 * explodes in the adopter's terminal on their first `tsc`. "desde 0 … sin
 * problemas" must never break like that.
 *
 * This verify script closes the gap the way the adopter experiences it:
 *   1. build the workspace `.d.ts` (the exact declarations npm ships),
 *   2. generate all four `create_project` kinds to a temp dir, and
 *   3. run `tsc --noEmit` on each against those declarations.
 *
 * A non-zero tsc for any kind fails the script. It is deliberately an
 * "compile the artifact" check, not a shape assertion — it fails the day
 * the scaffold and the public API drift apart, which is the day it matters.
 */
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
	scaffoldClientFiles,
	scaffoldExtensionHostFiles,
	scaffoldHostProject,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldToolFile,
} from '@mcp-vertex/core/public';

const ROOT = resolve(import.meta.dir, '../../..');

/** Workspace packages whose built declarations the scaffolds import. */
const DIST_DEPS = [
	'packages/core',
	'packages/client',
	'packages/ui-extension',
] as const;

const run = (command: string, args: readonly string[], cwd: string): number => {
	const result = spawnSync(command, args as string[], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		process.stderr.write(
			`${command} ${args.join(' ')} failed:\n${result.stdout || ''}${result.stderr || ''}\n`,
		);
	}
	return result.status ?? 1;
};

/** Ensure each dependency's `dist/*.d.ts` exists (build only what is missing). */
const ensureDeclarations = (): void => {
	const missing = DIST_DEPS.filter(
		(dep) => !existsSync(join(ROOT, dep, 'dist', 'index.d.ts')),
	);
	if (missing.length === 0) return;
	process.stdout.write(
		`scaffold-typecheck: building declarations for ${missing.join(', ')}…\n`,
	);
	const status = run(
		'bun',
		['tools/scripts/compile/build.script.ts', ...missing],
		ROOT,
	);
	if (status !== 0) {
		throw new Error(
			'scaffold-typecheck: failed to build workspace declarations',
		);
	}
};

/**
 * Force the `@mcp-vertex/*` specifiers to resolve to the BUILT `.d.ts`
 * (exactly what npm ships) rather than the workspace symlink into source.
 * Everything else a scaffold imports — `@modelcontextprotocol/sdk`, `zod`,
 * `bun`/`node` types — resolves by normal node_modules walk-up because the
 * scratch dir lives under the repo's `node_modules/.cache`.
 */
const scaffoldPaths = (): Record<string, string[]> => ({
	'@mcp-vertex/core': [join(ROOT, 'packages/core/dist/index.d.ts')],
	'@mcp-vertex/core/public': [
		join(ROOT, 'packages/core/dist/public/index.d.ts'),
	],
	'@mcp-vertex/core/*': [join(ROOT, 'packages/core/dist/*')],
	'@mcp-vertex/client': [join(ROOT, 'packages/client/dist/index.d.ts')],
	'@mcp-vertex/client/*': [join(ROOT, 'packages/client/dist/*')],
	'@mcp-vertex/ui-extension/public': [
		join(ROOT, 'packages/ui-extension/dist/public/index.d.ts'),
	],
	'@mcp-vertex/ui-extension/*': [join(ROOT, 'packages/ui-extension/dist/*')],
});

interface IScaffoldKind {
	readonly name: string;
	readonly files: readonly {
		readonly path: string;
		readonly content: string;
	}[];
}

const KINDS: readonly IScaffoldKind[] = [
	{
		name: 'host',
		files: scaffoldHostProject({
			projectName: 'Acme Quest',
			namespacePrefix: 'acme',
			projectPackageName: '@acme/mcp-project',
		}),
	},
	{
		name: 'plugin',
		files: scaffoldPluginFiles({
			pluginName: 'pepe',
			description: 'Example plugin.',
		}),
	},
	{
		name: 'client',
		files: scaffoldClientFiles({
			clientName: 'pepe',
			description: 'Example client.',
		}),
	},
	{
		name: 'extension-host',
		files: scaffoldExtensionHostFiles({
			hostName: 'pepe',
			description: 'Example extension host.',
		}),
	},
	// The live `scaffold` tool an agent calls to extend a project from 0:
	// each generated tool/prompt file must also compile against the SDK.
	{
		name: 'tool',
		files: [scaffoldToolFile('acme', 'do thing', 'Does a thing.')],
	},
	{
		name: 'prompt',
		files: [scaffoldPromptFile('acme', 'helper', 'Helps the agent.')],
	},
];

/** Write one kind's files, emit a tsconfig, and typecheck its production sources. */
const typecheckKind = (scratch: string, kind: IScaffoldKind): boolean => {
	const dir = join(scratch, kind.name);
	mkdirSync(dir, { recursive: true });
	const tsFiles: string[] = [];
	for (const file of kind.files) {
		const abs = join(dir, file.path);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, file.content, 'utf8');
		// Generated *.spec.ts are the adopter's own test harness (vitest is
		// their devDependency); the production sources are what must compile
		// against the shipped API here.
		if (file.path.endsWith('.ts') && !file.path.endsWith('.spec.ts')) {
			tsFiles.push(abs);
		}
	}
	const tsconfigPath = join(dir, 'tsconfig.verify.json');
	writeFileSync(
		tsconfigPath,
		JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'bundler',
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					esModuleInterop: true,
					types: ['bun', 'node'],
					paths: scaffoldPaths(),
				},
				include: tsFiles,
				exclude: [],
			},
			null,
			2,
		),
	);
	const status = run('bunx', ['tsc', '-p', tsconfigPath], ROOT);
	if (status === 0) {
		process.stdout.write(
			`  ✓ ${kind.name} (${tsFiles.length} source(s))\n`,
		);
		return true;
	}
	process.stderr.write(`  ✗ ${kind.name} scaffold does not typecheck\n`);
	return false;
};

const main = (): void => {
	ensureDeclarations();
	// Scratch under the repo's node_modules so a scaffold's non-workspace
	// imports (@modelcontextprotocol/sdk, zod, bun/node types) resolve by
	// the normal node_modules walk-up — the adopter's real resolution.
	const cacheRoot = join(ROOT, 'node_modules/.cache');
	mkdirSync(cacheRoot, { recursive: true });
	const scratch = mkdtempSync(join(cacheRoot, 'mcp-vertex-scaffold-tc-'));
	try {
		const results = KINDS.map((kind) => typecheckKind(scratch, kind));
		const failed = KINDS.filter((_kind, i) => !results[i]).map(
			(k) => k.name,
		);
		if (failed.length > 0) {
			throw new Error(
				`scaffold-typecheck: ${failed.length} scaffold kind(s) failed to compile against the shipped @mcp-vertex/* API: ${failed.join(', ')}. ` +
					`A create_project / scaffold template has drifted from the public API — fix the generator in packages/core/src/lib/scaffold/.`,
			);
		}
		process.stdout.write(
			`✓ scaffold-typecheck: all ${KINDS.length} scaffold kinds compile against the shipped declarations.\n`,
		);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
};

try {
	main();
} catch (err) {
	process.stderr.write(
		`${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
}
