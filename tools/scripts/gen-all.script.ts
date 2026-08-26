#!/usr/bin/env bun
/**
 * gen-all.script.ts — c00133 (AUD-P0-003).
 *
 * Orchestrates every code generator in `tools/scripts/generate/`
 * (and the token-budget dashboard) in a deterministic order so
 * downstream consumers always see fresh artifacts.
 *
 * Inputs:
 *   --check      Run every generator in real mode, then run
 *                `git diff --exit-code` against the working tree.
 *                Exits 1 when the working tree has uncommitted
 *                changes (i.e. drift). Used by CI to fail a PR
 *                that introduces drift.
 *   --list       Print every step without executing.
 *   --only <n>   Restrict to a single step (useful for local
 *                iteration).
 *
 * Exit codes:
 *   0  every step ran and `--check` found no drift (or `--list`).
 *   1  a step exited non-zero OR `--check` found drift.
 *   2  unknown `--only` selector.
 */

interface IStep {
	readonly name: string;
	readonly cmd: readonly string[];
	readonly description: string;
}

const STEPS: readonly IStep[] = [
	{
		name: 'from-manifests',
		cmd: ['bun', 'tools/scripts/generate/from-manifests.script.ts'],
		description: 'Sync manifests into the central registry.',
	},
	{
		name: 'first-party-plugin-index',
		cmd: [
			'bun',
			'tools/scripts/generate/first-party-plugin-index.script.ts',
		],
		description: 'Build the first-party plugin index.',
	},
	{
		name: 'web-catalog',
		cmd: ['bun', 'tools/scripts/generate/web-catalog.script.ts'],
		description: 'Refresh the web public catalog.',
	},
	{
		name: 'plugin-docs',
		cmd: ['bun', 'tools/scripts/generate/plugin-docs.script.ts'],
		description: 'Regenerate per-plugin docs.',
	},
	{
		name: 'permission-matrix',
		cmd: ['bun', 'tools/scripts/generate/permission-matrix.script.ts'],
		description: 'Regenerate the permission matrix.',
	},
	{
		name: 'preset-metadata',
		cmd: ['bun', 'tools/scripts/generate/preset-metadata.script.ts'],
		description: 'Refresh preset metadata.',
	},
];

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

const runStep = async (step: IStep): Promise<number> => {
	out(`▶ ${step.name} — ${step.description}`);
	const proc = Bun.spawn(step.cmd as string[], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const exit = await proc.exited;
	out(`  ${step.name} exited ${exit}`);
	return exit;
};

const runGitDiffExit = async (): Promise<number> => {
	out(`▶ drift-check — git diff --exit-code`);
	const proc = Bun.spawn(['git', 'diff', '--exit-code'], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	return proc.exited;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const check = hasFlag(argv, 'check');
	const list = hasFlag(argv, 'list');
	const only = flag(argv, 'only');
	const steps =
		only !== undefined ? STEPS.filter((s) => s.name === only) : STEPS;
	if (steps.length === 0) {
		err(`gen-all: unknown --only "${only}"`);
		err(`gen-all: valid names: ${STEPS.map((s) => s.name).join(', ')}`);
		return 2;
	}
	if (list) {
		for (const step of steps) {
			out(`  ${step.name}: ${step.cmd.join(' ')}`);
		}
		return 0;
	}

	out(`gen-all: ${steps.length} step(s)${check ? ' + drift-check' : ''}`);
	let worstExit = 0;
	for (const step of steps) {
		const code = await runStep(step);
		if (code !== 0) worstExit = code;
	}
	if (worstExit !== 0) {
		err(
			`gen-all: at least one generator exited non-zero (exit=${worstExit})`,
		);
		return 1;
	}
	if (check) {
		const code = await runGitDiffExit();
		if (code !== 0) {
			err(`gen-all: drift detected — see the diff above`);
			return 1;
		}
		out(`gen-all: no drift detected ✓`);
		return 0;
	}
	out(`gen-all: every step passed ✓`);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
