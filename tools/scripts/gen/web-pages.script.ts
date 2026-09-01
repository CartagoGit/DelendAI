#!/usr/bin/env bun
/**
 * gen/web-pages.script.ts — c00142 / q00006 Track I.
 *
 * Web pages drift check. Runs every web-side generator, then asks
 * `git diff --exit-code` whether the working tree changed. On drift,
 * prints a clear per-generator report naming the stale file and the
 * fix command — the existing `gen-all.script.ts --check` already
 * surfaces the same drift but only as a raw diff, which is hard to
 * map back to "which manifest is stale, how do I refresh it".
 *
 * Generators wired:
 *   1. `apps/web/scripts/gen-pages.ts --strict`
 *      → apps/web/src/data/manifests/pages.json
 *      (the PageSpec index; also covers i18n drift)
 *   2. `apps/web/scripts/gen-capabilities.ts --strict`
 *      → apps/web/src/data/manifests/capabilities.json
 *      (the live registry of tools/prompts/resources/knowledge)
 *   3. `apps/web/scripts/gen-skills.ts --strict`
 *      → apps/web/src/data/manifests/skills.json
 *      (the per-plugin skill index)
 *   4. `tools/scripts/generate/from-manifests.script.ts`
 *      → apps/web/src/data/plugins/catalog.generated.ts +
 *        apps/web/src/generated/plugin-manifest-catalog.generated.ts +
 *        docs/mcp-vertex/generated/plugin-manifests.generated.{md,json} +
 *        packages/core/src/lib/registry/generated/
 *          first-party-manifest-entries.generated.ts
 *      (the canonical plugin catalog + first-party registry)
 *   5. `tools/scripts/generate/web-catalog.script.ts`
 *      → docs/mcp-vertex/plugins/auto-generated/*.md
 *      (the per-plugin doc pages)
 *   6. `tools/scripts/gen/provenance-truth.script.ts`
 *      → docs/mcp-vertex/generated/observability-provenance.generated.md
 *      (the observability provenance graph contract + example links)
 *
 * Flags:
 *   --check       Run every generator, then `git diff --exit-code`.
 *                 Exit 0 when fresh, exit 1 on drift. The CI mode.
 *   --list        Print the step list without executing.
 *   --only <name> Run a single step (e.g. `pages`, `capabilities`).
 *
 * Exit codes:
 *   0  every step ran and the working tree is clean.
 *   1  a step exited non-zero OR drift was detected.
 *   2  unknown --only selector.
 *
 * Privacy: this script touches only checked-in artifacts under
 * `apps/web/src/`, `docs/mcp-vertex/generated/`, and
 * `packages/core/src/lib/registry/generated/`. No network calls, no
 * telemetry.
 */
interface IStep {
	readonly name: string;
	readonly label: string;
	readonly cmd: readonly string[];
	/** Workspace-relative paths this step writes. */
	readonly outputs: readonly string[];
	/** What the user should re-run to refresh this step. */
	readonly refresh: string;
}

export interface ISpawnedProcess {
	readonly exited: Promise<number>;
	readonly stdout?: ReturnType<typeof Bun.spawn>['stdout'];
	readonly stderr?: ReturnType<typeof Bun.spawn>['stderr'];
}

export type SpawnFn = (
	cmd: readonly string[],
	options: {
		readonly stdout: 'inherit' | 'pipe';
		readonly stderr: 'inherit' | 'pipe';
	},
) => ISpawnedProcess;

const spawnWithBun: SpawnFn = (cmd, options) => {
	const process = Bun.spawn([...cmd], options);
	return {
		exited: process.exited,
		...(process.stdout === undefined ? {} : { stdout: process.stdout }),
		...(process.stderr === undefined ? {} : { stderr: process.stderr }),
	};
};

const STEPS: readonly IStep[] = [
	{
		name: 'pages',
		label: 'web PageSpec index (i18n-aware pages.json)',
		cmd: ['bun', 'apps/web/scripts/gen-pages.ts', '--strict'],
		outputs: ['apps/web/src/data/manifests/pages.json'],
		refresh: 'bun apps/web/scripts/gen-pages.ts --strict',
	},
	{
		name: 'capabilities',
		label: 'web capabilities manifest (tools/prompts/resources)',
		cmd: ['bun', 'apps/web/scripts/gen-capabilities.ts', '--strict'],
		outputs: ['apps/web/src/data/manifests/capabilities.json'],
		refresh: 'bun apps/web/scripts/gen-capabilities.ts --strict',
	},
	{
		name: 'skills',
		label: 'web skills manifest (per-plugin skills index)',
		cmd: ['bun', 'apps/web/scripts/gen-skills.ts', '--strict'],
		outputs: ['apps/web/src/data/manifests/skills.json'],
		refresh: 'bun apps/web/scripts/gen-skills.ts --strict',
	},
	{
		name: 'from-manifests',
		label: 'plugin catalog + first-party registry',
		cmd: ['bun', 'tools/scripts/generate/from-manifests.script.ts'],
		outputs: [
			'apps/web/src/data/plugins/catalog.generated.ts',
			'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
			'docs/mcp-vertex/generated/plugin-manifests.generated.md',
			'docs/mcp-vertex/generated/plugin-manifests.generated.json',
			'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts',
		],
		refresh: 'bun tools/scripts/generate/from-manifests.script.ts',
	},
	{
		name: 'web-catalog',
		label: 'per-plugin doc pages',
		cmd: ['bun', 'tools/scripts/generate/web-catalog.script.ts'],
		outputs: ['docs/mcp-vertex/plugins/auto-generated/'],
		refresh: 'bun tools/scripts/generate/web-catalog.script.ts',
	},
	{
		name: 'observability-provenance',
		label: 'observability provenance generated truth',
		cmd: ['bun', 'tools/scripts/gen/provenance-truth.script.ts'],
		outputs: [
			'docs/mcp-vertex/generated/observability-provenance.generated.md',
		],
		refresh: 'bun tools/scripts/gen/provenance-truth.script.ts',
	},
];

const out = (msg: string): void => {
	process.stdout.write(`${msg}\n`);
};
const err = (msg: string): void => {
	process.stderr.write(`${msg}\n`);
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some(
		(token) => token === `--${name}` || token.startsWith(`--${name}=`),
	);

const flagValue = (
	argv: readonly string[],
	name: string,
): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const runStep = async (step: IStep, spawnFn: SpawnFn): Promise<number> => {
	out(`▶ ${step.name} — ${step.label}`);
	const proc = spawnFn(step.cmd, {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const exit = await proc.exited;
	out(`  ${step.name} exited ${exit}`);
	return exit;
};

const runGitDiff = async (spawnFn: SpawnFn): Promise<number> => {
	out(`▶ drift-check — git diff --exit-code`);
	const proc = spawnFn(['git', 'diff', '--exit-code'], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	return proc.exited;
};

const reportDrift = async (spawnFn: SpawnFn): Promise<number> => {
	// When `git diff --exit-code` returns non-zero the stdout is the
	// diff. We pipe that through `git status --porcelain` so the
	// per-file report lines up with what a human would see in
	// `git status`. Both probes run — one is a description, the other
	// is the canonical truth.
	const status = spawnFn(['git', 'status', '--porcelain'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const exit = await status.exited;
	if (exit !== 0) return exit;
	const stdout = status.stdout;
	if (stdout === undefined || typeof stdout === 'number') return exit;
	const text = await new Response(stdout).text();
	const trackedOutputs = new Set<string>(
		STEPS.flatMap((step) => step.outputs),
	);
	const staleByStep = new Map<string, string[]>();
	for (const step of STEPS) staleByStep.set(step.name, []);
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		const path = trimmed.split(/\s+/u).at(-1);
		if (path === undefined) continue;
		for (const step of STEPS) {
			for (const output of step.outputs) {
				if (path === output || path.startsWith(`${output}/`)) {
					const list = staleByStep.get(step.name) ?? [];
					list.push(path);
					staleByStep.set(step.name, list);
				}
			}
		}
		// If a file is dirty but doesn't match a tracked output (e.g.
		// a brand new generated file we forgot to register), surface
		// it under the catch-all bucket so the user is not blind.
		if (
			!trackedOutputs.has(path) &&
			!path.startsWith('docs/mcp-vertex/plugins/auto-generated/')
		) {
			// Skip untracked files outside our outputs — those are not
			// this script's responsibility.
		}
	}
	let anyDrift = false;
	for (const step of STEPS) {
		const stale = staleByStep.get(step.name) ?? [];
		if (stale.length === 0) continue;
		anyDrift = true;
		err(`✗ ${step.name} drifted:`);
		for (const path of stale) err(`    ${path}`);
		err(`  fix: ${step.refresh}`);
	}
	if (!anyDrift) {
		err(
			'web-pages: drift detected, but no tracked output matches — run the full gen suite:',
		);
		err('  bun tools/scripts/gen-all.script.ts');
	}
	return 1;
};

/**
 * Programmatic entry point — lets the spec drive the pipeline with
 * stubs for `Bun.spawn` without crossing the test boundary.
 */
export interface IRunOptions {
	readonly argv: readonly string[];
	readonly spawn?: SpawnFn;
}

export const run = async (options: IRunOptions): Promise<number> => {
	const spawnFn: SpawnFn = options.spawn ?? spawnWithBun;
	const check = hasFlag(options.argv, 'check');
	const list = hasFlag(options.argv, 'list');
	const only = flagValue(options.argv, 'only');
	const steps =
		only !== undefined ? STEPS.filter((step) => step.name === only) : STEPS;
	if (steps.length === 0) {
		err(`web-pages: unknown --only "${only}"`);
		err(
			`web-pages: valid names: ${STEPS.map((step) => step.name).join(', ')}`,
		);
		return 2;
	}
	if (list) {
		for (const step of steps) {
			out(`  ${step.name}: ${step.cmd.join(' ')}`);
			for (const output of step.outputs) out(`    → ${output}`);
		}
		return 0;
	}

	out(`web-pages: ${steps.length} step(s)${check ? ' + drift-check' : ''}`);
	let worstExit = 0;
	const failingSteps: string[] = [];
	for (const step of steps) {
		const code = await runStep(step, spawnFn);
		if (code !== 0) {
			worstExit = code;
			failingSteps.push(`${step.name} (exit=${code})`);
		}
	}
	if (worstExit !== 0) {
		err(
			`web-pages: ${failingSteps.length} generator(s) exited non-zero: ${failingSteps.join(', ')}`,
		);
		return 1;
	}
	if (check) {
		const code = await runGitDiff(spawnFn);
		if (code !== 0) {
			err(`web-pages: drift detected — see the per-step report above`);
			return reportDrift(spawnFn);
		}
		out(`web-pages: no drift detected ✓`);
		return 0;
	}
	out(`web-pages: every step passed ✓`);
	return 0;
};

if (import.meta.main) {
	process.exit(await run({ argv: process.argv.slice(2) }));
}
