#!/usr/bin/env bun
/**
 * Verify that every first-party plugin owns an executable test suite.
 *
 * The root vitest config already runs each plugin as a project with its own
 * config, so running them again here repeated the whole plugin suite, in
 * series: it outlasted every job. `--run` still runs each through its own
 * package process, side by side, for whoever wants that by hand.
 *
 * The plugin list and test files are derived from the workspace. Adding a
 * plugin without tests therefore fails this gate without requiring a
 * hand-maintained allowlist.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

import { inPool } from '../lint/run-together.script';

export interface IPluginTestSuite {
	readonly id: string;
	readonly packagePath: string;
	readonly testFiles: readonly string[];
}

const isTestFile = (name: string): boolean =>
	name.endsWith('.spec.ts') || name.endsWith('.test.ts');

const collectTestFiles = async (
	root: string,
	current: string,
): Promise<readonly string[]> => {
	const entries = await readdir(current, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectTestFiles(root, absolute)));
		} else if (entry.isFile() && isTestFile(entry.name)) {
			files.push(absolute.slice(root.length + 1));
		}
	}
	return files.sort();
};

export const discoverPluginTestSuites = async (
	workspaceRoot: string,
): Promise<readonly IPluginTestSuite[]> => {
	const pluginsRoot = join(workspaceRoot, 'plugins');
	const entries = await readdir(pluginsRoot, { withFileTypes: true });
	const suites: IPluginTestSuite[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const packagePath = join(pluginsRoot, entry.name, 'package.json');
		const pluginRoot = join(pluginsRoot, entry.name);
		// One read, and the read is the existence check. The `stat`-then-
		// read this replaced asked twice and trusted the first answer:
		// a plugin being scaffolded next door could pass the stat and be
		// gone (or half-written) by the read, and the gate blamed it.
		const raw = await readFile(packagePath, 'utf8').catch(() => null);
		if (raw === null) continue;

		const packageJson = JSON.parse(raw) as {
			scripts?: { test?: unknown };
		};
		if (packageJson.scripts?.test !== 'vitest run') {
			throw new Error(
				`plugin ${entry.name} must expose scripts.test="vitest run"`,
			);
		}

		const testFiles = await collectTestFiles(workspaceRoot, pluginRoot);
		if (testFiles.length === 0) {
			throw new Error(`plugin ${entry.name} has no test files`);
		}
		suites.push({
			id: entry.name,
			packagePath,
			testFiles,
		});
	}

	return suites.sort((a, b) => a.id.localeCompare(b.id));
};

export const buildVitestArgs = (
	suites: readonly IPluginTestSuite[],
): readonly string[] => [
	'vitest',
	'run',
	...suites.flatMap((suite) => suite.testFiles),
];

export const buildPluginTestCommand = (
	suite: IPluginTestSuite,
): readonly string[] => ['run', '--cwd', `plugins/${suite.id}`, 'test'];

const runSuite = (
	workspaceRoot: string,
	suite: IPluginTestSuite,
): Promise<{
	readonly id: string;
	readonly code: number;
	readonly output: string;
}> =>
	new Promise((resolve) => {
		const child = spawn('bun', [...buildPluginTestCommand(suite)], {
			cwd: workspaceRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		const keep = (chunk: unknown): void => {
			output += String(chunk);
		};
		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		child.on('error', (error) => {
			resolve({ id: suite.id, code: 1, output: error.message });
		});
		child.on('close', (code) => {
			resolve({ id: suite.id, code: code ?? 1, output });
		});
	});

export const runPluginSuites = async (
	workspaceRoot: string,
): Promise<number> => {
	const suites = await discoverPluginTestSuites(workspaceRoot);
	if (suites.length === 0) {
		throw new Error('no plugin test suites discovered');
	}

	const testFiles = suites.reduce(
		(total, suite) => total + suite.testFiles.length,
		0,
	);
	process.stdout.write(
		`plugin-suites: ${suites.length} plugins, ${testFiles} test files; isolated processes, side by side\n`,
	);
	// Each suite in its own process, as before, but side by side: one after
	// another, fifty suites outlasted every job that ran them.
	const runs = await inPool(suites, availableParallelism(), (suite) =>
		runSuite(workspaceRoot, suite),
	);
	for (const run of runs) {
		if (run.code !== 0) process.stderr.write(run.output);
	}
	const failures = runs
		.filter((run) => run.code !== 0)
		.map((run) => `${run.id}: exit ${String(run.code)}`);
	if (failures.length > 0) {
		process.stderr.write(
			`plugin-suites: ${failures.length} suite(s) failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`,
		);
		return 1;
	}
	process.stdout.write(`plugin-suites: all ${suites.length} suites passed\n`);
	return 0;
};

/** Each plugin has a suite: throws when one has none. */
export const verifyPluginSuites = async (
	workspaceRoot: string,
): Promise<number> => {
	const suites = await discoverPluginTestSuites(workspaceRoot);
	if (suites.length === 0) {
		throw new Error('no plugin test suites discovered');
	}
	process.stdout.write(
		`plugin-suites: ${suites.length} plugins each own a test suite\n`,
	);
	return 0;
};

if (import.meta.main) {
	const workspaceRoot = resolve(process.cwd());
	(process.argv.includes('--run')
		? runPluginSuites(workspaceRoot)
		: verifyPluginSuites(workspaceRoot)
	)
		.then((code) => process.exit(code))
		.catch((error: unknown) => {
			process.stderr.write(
				`plugin-suites: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		});
}
