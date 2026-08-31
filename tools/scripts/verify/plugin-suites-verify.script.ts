#!/usr/bin/env bun
/**
 * Verify that every first-party plugin owns an executable test suite and
 * run all discovered plugin tests through one Vitest invocation.
 *
 * The plugin list and test files are derived from the workspace. Adding a
 * plugin without tests therefore fails this gate without requiring a
 * hand-maintained allowlist.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
		const [packageStats, pluginStats] = await Promise.all([
			stat(packagePath).catch(() => null),
			stat(pluginRoot).catch(() => null),
		]);
		if (!packageStats?.isFile()) continue;
		if (!pluginStats?.isDirectory()) {
			throw new Error(`plugin ${entry.name} has no package directory`);
		}

		const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
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
		`plugin-suites: ${suites.length} plugins, ${testFiles} test files; isolated processes\n`,
	);
	const failures: string[] = [];
	for (const suite of suites) {
		const result = spawnSync('bun', buildPluginTestCommand(suite), {
			cwd: workspaceRoot,
			stdio: 'inherit',
		});
		if (result.error) {
			failures.push(`${suite.id}: ${result.error.message}`);
			continue;
		}
		if ((result.status ?? 1) !== 0) {
			failures.push(`${suite.id}: exit ${result.status ?? 1}`);
		}
	}
	if (failures.length > 0) {
		process.stderr.write(
			`plugin-suites: ${failures.length} suite(s) failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`,
		);
		return 1;
	}
	process.stdout.write(`plugin-suites: all ${suites.length} suites passed\n`);
	return 0;
};

if (import.meta.main) {
	const workspaceRoot = resolve(process.cwd());
	runPluginSuites(workspaceRoot)
		.then((code) => process.exit(code))
		.catch((error: unknown) => {
			process.stderr.write(
				`plugin-suites: ${error instanceof Error ? error.message : String(error)}\n`,
			);
			process.exit(1);
		});
}
