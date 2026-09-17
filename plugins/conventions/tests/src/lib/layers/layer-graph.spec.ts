import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	findUnenforcedRules,
	LAYER_GRAPH,
	layerOf,
	rulesFor,
} from '../../../../src/lib/layers/layer-graph.service';

/**
 * The repo root, found by walking up for the package.json that actually
 * declares the lints — not by trusting the runner's cwd, which differs
 * between `vitest --root plugins/conventions` and a repo-wide run.
 */
const repoRootPackageJson = (): Record<string, string> => {
	let dir = import.meta.dirname;
	for (let depth = 0; depth < 10; depth += 1) {
		const candidate = join(dir, 'package.json');
		if (existsSync(candidate)) {
			const raw: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
			if (raw !== null && typeof raw === 'object' && 'scripts' in raw) {
				const scripts = (raw as { scripts: unknown }).scripts;
				if (
					scripts !== null &&
					typeof scripts === 'object' &&
					'lint:cli-imports' in scripts
				) {
					return scripts as Record<string, string>;
				}
			}
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error('could not find the repo root package.json');
};

describe('layer graph — every edge is a rule something enforces', () => {
	/**
	 * The slice this implements asks for a declaration DERIVED from the
	 * lints, not a second opinion. This is the assertion that keeps it
	 * derived: if a rule names an enforcer that no longer exists — the
	 * script renamed, folded into another, deleted — the graph stops
	 * being a reading of the gates and starts being folklore, and this
	 * fails rather than letting an agent be told something untrue.
	 */
	it('names a real lint script for every rule', () => {
		const scripts = repoRootPackageJson();
		const missing = LAYER_GRAPH.rules
			.filter((rule) => !(rule.enforcedBy in scripts))
			.map((rule) => `${rule.from} -> ${rule.enforcedBy}`);
		expect(missing).toEqual([]);
	});

	it('reports a rule whose enforcer is missing instead of hiding it', () => {
		const gaps = findUnenforcedRules(new Set(['lint:cli-imports']));
		expect(gaps.length).toBeGreaterThan(0);
		expect(gaps.every((gap) => gap.reason === 'no-such-lint')).toBe(true);
	});

	it('reports a rule declared unenforced, even when the lint exists', () => {
		const graph = {
			layers: LAYER_GRAPH.layers,
			rules: [
				{
					from: 'core',
					forbids: 'something nothing checks yet',
					enforcedBy: 'lint:cli-imports',
					detector: 'no-internal-core-imports' as const,
					because: 'documented ahead of its gate',
					unenforced: true,
				},
			],
		};
		const gaps = findUnenforcedRules(new Set(['lint:cli-imports']), graph);
		expect(gaps).toHaveLength(1);
		expect(gaps[0]?.reason).toBe('declared-unenforced');
	});

	it('finds no gap when every enforcer exists', () => {
		const scripts = repoRootPackageJson();
		expect(findUnenforcedRules(new Set(Object.keys(scripts)))).toEqual([]);
	});
});

describe('layer graph — where a path belongs', () => {
	it.each([
		['packages/contracts/src/index.ts', 'core-contracts'],
		['packages/state/src/registry.ts', 'state'],
		['packages/client/src/lib/client.ts', 'client'],
		['packages/cli/src/commands/init.command.ts', 'cli'],
		['packages/core/src/lib/shared/tool-response.ts', 'core'],
		['tools/scripts/lint/cli-imports.script.ts', 'tools'],
		['plugins/conventions/src/index.ts', 'plugins'],
	])('maps %s to %s', (path, expected) => {
		expect(layerOf(path)).toBe(expected);
	});

	it('returns undefined for a path in no declared layer', () => {
		expect(layerOf('docs/delendai/AGENT-BOOTSTRAP.md')).toBeUndefined();
	});

	it('gives a contracts file the contracts rule, not the core one', () => {
		const rules = rulesFor('packages/contracts/src/thing.interface.ts');
		// Its own layer rule, plus the one that applies everywhere.
		expect(rules.map((rule) => rule.enforcedBy)).toEqual([
			'lint:no-node-imports-in-contracts',
			'lint:no-absolute-local-imports',
		]);
	});

	it('gives a tools script the public-barrel rule', () => {
		const rules = rulesFor('tools/scripts/lint/demo.script.ts');
		expect(rules.map((rule) => rule.enforcedBy)).toEqual([
			'lint:cli-imports',
			'lint:no-absolute-local-imports',
		]);
	});
});
