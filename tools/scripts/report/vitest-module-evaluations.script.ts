#!/usr/bin/env bun
/**
 * vitest-module-evaluations.script.ts — how many times each project
 * evaluated its modules in a vitest run, read from the run's own output.
 *
 * vitest closes a run with one "Import" line per project:
 *   Import   proposals  1631 modules were evaluated 175702 times · 268.99s
 * A project that evaluates each module once per spec file pays for its
 * isolation there; this prints the counts so a change to isolation is
 * judged by them.
 *
 *   bunx vitest run --project proposals > run.log
 *   bun tools/scripts/report/vitest-module-evaluations.script.ts run.log
 */
import { readFileSync } from 'node:fs';

/** One project's evaluations in a run. */
export interface IModuleEvaluations {
	readonly project: string;
	readonly modules: number;
	readonly evaluations: number;
	/** Seconds spent importing, when vitest says. */
	readonly importSeconds?: number;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');
const IMPORT_LINE =
	/Import\s+(\S+)\s+(\d+)\s+modules were evaluated\s+(\d+)\s+times(?:\s*·\s*([\d.]+)s)?/u;

/** Every project's evaluations a run's output reports. */
export const moduleEvaluationsOf = (
	output: string,
): readonly IModuleEvaluations[] =>
	output
		.replace(ANSI, '')
		.split('\n')
		.flatMap((line) => {
			const match = IMPORT_LINE.exec(line);
			if (match === null) return [];
			const [, project = '', modules = '0', evaluations = '0', seconds] =
				match;
			return [
				{
					project,
					modules: Number(modules),
					evaluations: Number(evaluations),
					...(seconds === undefined
						? {}
						: { importSeconds: Number(seconds) }),
				},
			];
		});

if (import.meta.main) {
	const file = process.argv[2];
	const output = readFileSync(file ?? 0, 'utf8');
	const rows = moduleEvaluationsOf(output);
	if (rows.length === 0) {
		process.stderr.write(
			'vitest-module-evaluations: no "modules were evaluated" line in the output.\n',
		);
		process.exit(1);
	}
	for (const row of rows)
		process.stdout.write(
			`${row.project}: ${row.modules} modules, ${row.evaluations} evaluations (${(row.evaluations / Math.max(row.modules, 1)).toFixed(1)} per module)${row.importSeconds === undefined ? '' : `, ${row.importSeconds}s importing`}\n`,
		);
}
