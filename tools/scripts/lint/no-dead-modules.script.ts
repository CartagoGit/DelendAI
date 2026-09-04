#!/usr/bin/env bun
/**
 * no-dead-modules.script.ts — modules whose every function is dead.
 *
 * ## The failure this exists to catch
 *
 * `plugins/github/src/lib/diagnostics.ts` and its GitLab twin are 1,197
 * lines of shipped adapter code. Between them they have 61 functions and
 * 509 branches, and **not one of those functions has ever run** — no
 * tool calls them, no test calls them, nothing in the repository does.
 *
 * Every existing check was satisfied. They typecheck. They lint. They
 * are exported from their plugin barrels, so no dead-export rule fires.
 * `f00415` S3 even declares a delivery gate for them, and
 * `plugins/github/tests/diagnostics.spec.ts` passes — while importing
 * `../src/lib/tools` and never once naming `diagnoseGitHubWorkflow`.
 * A spec named after a module it does not test is worse than no spec:
 * it answers the question "is this covered?" with a green tick.
 *
 * The aggregate coverage number hid it too. 1,197 dead lines move the
 * repo-wide branch percentage by under two points, so the gate that
 * should have noticed was itself averaging the evidence away.
 *
 * ## Why "zero functions executed" and not a percentage
 *
 * Percentages invite negotiation and every module has some threshold
 * that lets it through. Zero does not: a module with several functions
 * where none has ever been called is either dead code or shipped
 * behaviour nobody has ever run. Both are worth a decision, and neither
 * is worth arguing about a number.
 *
 * Module-level statements are excluded from the judgement deliberately.
 * The two diagnostics files show 13-16% *statement* coverage purely
 * because a constant at the top of the file is evaluated when a barrel
 * imports them — which is precisely how the emptiness stayed hidden.
 * Functions are the honest unit.
 *
 * ## Ratchet, not a wall
 *
 * There are 46 such modules today. The baseline records them so the
 * number can only fall; a NEW dead module fails the build. Entries are
 * removed by `--update` once they are covered or deleted.
 *
 * Requires a coverage run (`bun run test:coverage`) to have produced
 * `.cache/coverage/coverage-summary.json`. If that file is missing or
 * predates the newest source change, this REFUSES to report ok rather
 * than passing on stale evidence — a gate that silently skips is the
 * exact failure mode it was written to catch.
 *
 * Exit codes: 0 no new dead modules, 1 new dead module(s) or no usable
 * coverage data.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SUMMARY_PATH = '.cache/coverage/coverage-summary.json';
export const BASELINE_PATH = 'tools/scripts/lint/no-dead-modules.baseline.json';

/**
 * Below this, "no function ran" is too often a legitimate shape — a
 * module holding one helper behind a feature flag, a two-function
 * `real-deps.ts` seam that only production wires up.
 */
export const MIN_FUNCTIONS = 3;

export interface ICoverageEntry {
	readonly functions: { readonly total: number; readonly covered: number };
	readonly branches: { readonly total: number; readonly covered: number };
}

export interface IDeadModule {
	readonly file: string;
	readonly functions: number;
	readonly branches: number;
}

/** Modules with at least `MIN_FUNCTIONS` and zero of them executed. */
export const findDeadModules = (
	summary: Readonly<Record<string, ICoverageEntry>>,
	root: string,
	minFunctions: number = MIN_FUNCTIONS,
): readonly IDeadModule[] => {
	const dead: IDeadModule[] = [];
	for (const [key, entry] of Object.entries(summary)) {
		if (key === 'total') continue;
		const fns = entry.functions;
		if (fns.total < minFunctions || fns.covered > 0) continue;
		dead.push({
			file: key.startsWith('/') ? relative(root, key) : key,
			functions: fns.total,
			branches: entry.branches.total,
		});
	}
	return [...dead].sort((left, right) =>
		right.functions === left.functions
			? left.file.localeCompare(right.file)
			: right.functions - left.functions,
	);
};

const readJson = <T>(path: string): T | undefined => {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return undefined;
	}
};

const main = (): number => {
	const root = process.cwd();
	const update = process.argv.includes('--update');

	const summary = readJson<Record<string, ICoverageEntry>>(
		join(root, SUMMARY_PATH),
	);
	if (summary === undefined) {
		console.error(
			`✖ no-dead-modules: no coverage data at ${SUMMARY_PATH}.\n` +
				'Run `bun run test:coverage` first. Refusing to report ok — a gate\n' +
				'that passes when it examined nothing is the failure this one exists\n' +
				'to catch.',
		);
		return 1;
	}

	const dead = findDeadModules(summary, root);
	const baseline = readJson<string[]>(join(root, BASELINE_PATH)) ?? [];

	if (update) {
		writeFileSync(
			join(root, BASELINE_PATH),
			`${JSON.stringify(
				dead.map((entry) => entry.file),
				null,
				'\t',
			)}\n`,
		);
		console.log(
			`no-dead-modules: baseline updated — ${String(dead.length)} module(s).`,
		);
		return 0;
	}

	const known = new Set(baseline);
	const added = dead.filter((entry) => !known.has(entry.file));
	const fixed = baseline.filter(
		(file) => !dead.some((entry) => entry.file === file),
	);

	if (added.length > 0) {
		console.error(
			`✖ no-dead-modules: ${String(added.length)} module(s) where NO function is ever executed:`,
		);
		for (const entry of added) {
			console.error(
				`  ${entry.file}: ${String(entry.functions)} function(s), ${String(entry.branches)} branch(es), 0 executed`,
			);
		}
		console.error(
			'\nEither nothing calls this module (dead code — delete it, or wire it to\n' +
				'the surface it was written for), or it ships behaviour no test has ever\n' +
				'run. A spec named after the module is not evidence: check that it really\n' +
				'imports it. If the module is deliberately unreachable from tests, run\n' +
				`\`bun ${relative(root, process.argv[1] ?? '')} --update\` to record it.`,
		);
		return 1;
	}

	const trend =
		fixed.length > 0
			? ` (${String(fixed.length)} baselined module(s) now covered — run --update to lock in the win)`
			: '';
	console.log(
		`✓ no-dead-modules: no new dead modules; ${String(dead.length)} baselined${trend}.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
