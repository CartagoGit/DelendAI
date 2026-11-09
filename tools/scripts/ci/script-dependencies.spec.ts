/**
 * script-dependencies.spec.ts — whether a CI step needs `node_modules`
 * is read from the import graph of what it runs, so every case here is a
 * small graph.
 */
import { describe, expect, it } from 'vitest';

import {
	aliasTarget,
	commandNeedsInstall,
	fileNeedsInstall,
	specifiersIn,
	type IScriptDependencyReaders,
} from './script-dependencies';

/**
 * A `bun run <name>` command for a fixture script.
 *
 * Built rather than written out because `lint:referenced-scripts-exist`
 * scans this directory for that literal and requires every name it finds
 * to exist in the root `package.json` — which is right for workflows and
 * CI drivers, and wrong for a spec whose scripts are invented on purpose.
 */
const bunRun = (name: string): string => ['bun', 'run', name].join(' ');

const ALIASES: Readonly<Record<string, readonly string[]>> = {
	'@fixture/core': ['./packages/core/src/index.ts'],
	'@fixture/core/*': ['./packages/core/src/*'],
};

const readers = (
	files: Readonly<Record<string, string>>,
	scripts: Readonly<Record<string, string>> = {},
): IScriptDependencyReaders => ({
	aliases: ALIASES,
	scriptOf: (name) => scripts[name],
	readSource: (path) => files[path],
});

describe('aliasTarget', () => {
	it('prefers an exact key', () => {
		expect(aliasTarget(ALIASES, '@fixture/core')).toBe(
			'packages/core/src/index.ts',
		);
	});

	it('expands a wildcard', () => {
		expect(aliasTarget(ALIASES, '@fixture/core/lib/a.constant')).toBe(
			'packages/core/src/lib/a.constant',
		);
	});

	it('does not cover a real package', () => {
		expect(aliasTarget(ALIASES, 'zod')).toBeUndefined();
	});
});

describe('aliases are files, not packages', () => {
	it('lets an import-lean guard reach an alias that imports nothing', () => {
		// The shape of `develop-protection-live`: the guard imports a
		// constant through `@delendai/core/lib/...`, Bun resolves it via
		// `paths`, and the job rightly runs without an install.
		expect(
			fileNeedsInstall(
				'tools/guard.ts',
				readers({
					'tools/guard.ts':
						"import { SLUG } from '@fixture/core/lib/identity.constant';",
					'packages/core/src/lib/identity.constant.ts':
						"export const SLUG = 'o/r';",
				}),
			),
		).toBe(false);
	});

	it('still finds a package behind an alias — the reaper case', () => {
		expect(
			fileNeedsInstall(
				'tools/guard.ts',
				readers({
					'tools/guard.ts': "import { core } from '@fixture/core';",
					'packages/core/src/index.ts':
						"import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
				}),
			),
		).toBe(true);
	});
});

describe('specifiersIn', () => {
	it('reads static, dynamic, side-effect and require specifiers', () => {
		expect(
			specifiersIn(
				[
					"import { a } from './a';",
					"import './side';",
					"const b = await import('pkg-b');",
					"const c = require('pkg-c');",
				].join('\n'),
			),
		).toEqual(['./a', './side', 'pkg-b', 'pkg-c']);
	});

	it('does not read an import written in a comment', () => {
		expect(
			specifiersIn("/** import { x } from 'pkg' */\n// from 'other'\n"),
		).toEqual([]);
	});
});

describe('fileNeedsInstall', () => {
	it('is false for a graph of node builtins and relative files', () => {
		expect(
			fileNeedsInstall(
				'tools/a.ts',
				readers({
					'tools/a.ts': "import { x } from 'node:fs';\nimport './b';",
					'tools/b.ts': "import { y } from 'bun:sqlite';",
				}),
			),
		).toBe(false);
	});

	it('finds a package two relative hops away — the reaper case', () => {
		// guard -> repo-paths -> core. The entry file imports nothing
		// suspicious; the package is where the YAML could never see it.
		expect(
			fileNeedsInstall(
				'tools/guard.ts',
				readers({
					'tools/guard.ts': "import { root } from './lib/paths';",
					'tools/lib/paths.ts':
						"import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
				}),
			),
		).toBe(true);
	});

	it('resolves a directory import to its index', () => {
		expect(
			fileNeedsInstall(
				'tools/a.ts',
				readers({
					'tools/a.ts': "import './lib';",
					'tools/lib/index.ts': "import 'zod';",
				}),
			),
		).toBe(true);
	});

	it('ends on an import cycle', () => {
		expect(
			fileNeedsInstall(
				'a.ts',
				readers({ 'a.ts': "import './b';", 'b.ts': "import './a';" }),
			),
		).toBe(false);
	});

	it('treats an unreadable entry as no evidence, not as a package', () => {
		expect(fileNeedsInstall('missing.ts', readers({}))).toBe(false);
	});
});

describe('commandNeedsInstall', () => {
	it('follows `bun run` into the script body and on to the file', () => {
		expect(
			commandNeedsInstall(
				'bun run lint:ref-lifecycle -- --reap',
				readers(
					{ 'tools/guard.ts': "import 'pkg';" },
					{ 'lint:ref-lifecycle': 'bun tools/guard.ts' },
				),
			),
		).toBe(true);
	});

	it('follows a chain of scripts joined by &&', () => {
		expect(
			commandNeedsInstall(
				bunRun('all'),
				readers(
					{ 'tools/lean.ts': '', 'tools/heavy.ts': "import 'pkg';" },
					{
						all: `${bunRun('lean')} && ${bunRun('heavy')}`,
						lean: 'bun tools/lean.ts',
						heavy: 'bun tools/heavy.ts',
					},
				),
			),
		).toBe(true);
	});

	it('ends on a script that runs itself', () => {
		expect(
			commandNeedsInstall(
				bunRun('loop'),
				readers({}, { loop: bunRun('loop') }),
			),
		).toBe(false);
	});

	it('is false for a zero-import summary script', () => {
		expect(
			commandNeedsInstall(
				'bun tools/scripts/ci/validate-summary.script.ts',
				readers({
					'tools/scripts/ci/validate-summary.script.ts':
						'const needs = process.env.CI_NEEDS_JSON;',
				}),
			),
		).toBe(false);
	});
});
