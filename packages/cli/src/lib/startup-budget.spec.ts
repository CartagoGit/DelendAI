import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Startup budget per command family.
 *
 * Measured on a fixture, `work status` took 3.3 s against 0.5 s for
 * `--version`: the registry of every command was imported and a server
 * was spawned for a command that never called it. Time is noise on a
 * shared machine, so the budget is the static import graph (modules of
 * this package a family loads before its first line) and the absence of
 * the registry and of the server client from it.
 */
const SRC = resolve(__dirname, '..');

const STATIC_IMPORT =
	/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s+'(\.[^']+)'/gm;

/** The TypeScript file a relative specifier names; data files have none. */
const resolveModule = (from: string, specifier: string): string | undefined =>
	[
		`${resolve(dirname(from), specifier)}.ts`,
		resolve(dirname(from), specifier, 'index.ts'),
	].find((candidate) => existsSync(candidate));

const graphOf = (entry: string): ReadonlySet<string> => {
	const seen = new Set<string>();
	const visit = (file: string): void => {
		if (seen.has(file)) return;
		seen.add(file);
		const source = readFileSync(file, 'utf8');
		for (const pattern of [STATIC_IMPORT, SIDE_EFFECT_IMPORT]) {
			for (const match of source.matchAll(pattern)) {
				const next = resolveModule(file, match[1] ?? '');
				if (next !== undefined) visit(next);
			}
		}
	};
	visit(entry);
	return seen;
};

const relative = (graph: ReadonlySet<string>): string[] =>
	[...graph].map((file) => file.slice(SRC.length + 1));

const FAMILIES = [
	{ family: 'work', entry: 'commands/work.command.ts', modules: 8 },
	{ family: 'guard', entry: 'commands/guard.command.ts', modules: 16 },
	{
		family: 'proposals',
		entry: 'commands/groups/proposals.ts',
		modules: 7,
	},
	{ family: 'entrypoint', entry: 'index.ts', modules: 30 },
] as const;

describe('startup budget', () => {
	for (const { family, entry, modules } of FAMILIES) {
		it(`${family} loads neither the registry nor the server client`, () => {
			const graph = relative(graphOf(resolve(SRC, entry)));
			expect(graph).not.toContain('commands/registry.ts');
			expect(graph).not.toContain('lib/stdio-context.factory.ts');
			const groups = graph.filter(
				(file) =>
					file.startsWith('commands/groups/') &&
					file !== 'commands/groups/group-helpers.ts',
			);
			expect(groups).toEqual(
				family === 'proposals' ? ['commands/groups/proposals.ts'] : [],
			);
		});

		it(`${family} stays within ${String(modules)} modules of this package`, () => {
			expect(graphOf(resolve(SRC, entry)).size).toBeLessThanOrEqual(
				modules,
			);
		});
	}
});
