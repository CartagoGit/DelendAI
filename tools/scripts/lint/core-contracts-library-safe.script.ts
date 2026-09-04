#!/usr/bin/env bun
/**
 * core-contracts-library-safe.script.ts — unblocks `r00041` S3.
 *
 * `@delendai/core/contracts` documents itself as "a thin barrel that
 * re-exports the type-only contracts — no Node-only modules", and the
 * whole point of the subpath is that a consumer can take a type from it
 * without inheriting the core's runtime weight. `r00041` needed exactly
 * that for `@delendai/client`, tried it, and found the promise was not
 * true: its S3/S4 slices have been blocked on this since 2026-09-02.
 *
 * ## Why a compiler run and not a regex
 *
 * The repo already has `lint:no-node-imports-in-contracts`, but that
 * guards a different package (`packages/contracts/src`) by scanning
 * import specifiers in the files it owns. Neither half helps here. The
 * breakage is TRANSITIVE and invisible at the barrel: re-exporting a
 * type from an implementation module makes TypeScript type-check that
 * entire module, so `export type { IDelendaiProject } from
 * '../lib/project/create-mcp-project'` quietly pulled in
 * `tool-surface-runtime` and through it `node:async_hooks`. No regex
 * over `src/contracts/` can see that; only resolving the graph can.
 *
 * And it is invisible to every other gate for one reason: the entire
 * repository compiles WITH `@types/node`. The failure only exists for a
 * consumer who does not have it — which is precisely the consumer this
 * subpath was built for, and who never runs our test suite.
 *
 * So the check is a real `tsc` run over `src/contracts/index.ts` with
 * `"types": []`, which is the only thing that reproduces that consumer.
 *
 * ## Fixing a failure
 *
 * Do NOT add `@types/node` to `tsconfig.contracts-library-safe.json` —
 * that deletes the gate rather than passing it. Move the offending type
 * into `packages/core/src/lib/contracts/interfaces/` and re-export it
 * from there; leave `export type { X };` behind in the implementation
 * module so existing importers keep working.
 *
 * Exit codes: 0 library-safe, 1 something Node-only leaked in.
 */
import { spawnSync } from 'node:child_process';

export const PROJECT = 'packages/core/tsconfig.contracts-library-safe.json';

export interface ILibrarySafetyResult {
	readonly ok: boolean;
	readonly offendingFiles: readonly string[];
	readonly errorCount: number;
}

/** Group `tsc` diagnostics by the file that produced them. */
export const parseDiagnostics = (output: string): ILibrarySafetyResult => {
	const offending = new Set<string>();
	let errorCount = 0;
	for (const line of output.split('\n')) {
		const match = /^(.+?)\((\d+),(\d+)\): error TS/u.exec(line);
		if (match === null) continue;
		errorCount += 1;
		offending.add(match[1] as string);
	}
	return {
		ok: errorCount === 0,
		offendingFiles: [...offending].sort(),
		errorCount,
	};
};

const main = (): number => {
	const run = spawnSync('bunx', ['tsc', '-p', PROJECT], {
		encoding: 'utf8',
		cwd: process.cwd(),
	});
	const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
	const result = parseDiagnostics(output);

	if (result.ok && run.status === 0) {
		console.log(
			'✓ core-contracts-library-safe: @delendai/core/contracts compiles with no @types/node.',
		);
		return 0;
	}

	if (result.errorCount === 0) {
		// tsc failed without emitting a diagnostic we could attribute —
		// report the raw output rather than claiming the barrel is clean.
		console.error(
			`✖ core-contracts-library-safe: tsc exited ${String(run.status)} with no parsable diagnostic:\n${output}`,
		);
		return 1;
	}

	console.error(
		`✖ core-contracts-library-safe: ${String(result.errorCount)} error(s) in ${String(result.offendingFiles.length)} file(s) — the contracts barrel is dragging Node-only code:`,
	);
	for (const file of result.offendingFiles) console.error(`  ${file}`);
	console.error(
		'\nA consumer of @delendai/core/contracts without @types/node cannot compile.\n' +
			'Move the offending type into packages/core/src/lib/contracts/interfaces/ and\n' +
			're-export it from there, leaving `export type { X };` in the implementation\n' +
			'module so existing importers keep working. Do NOT add @types/node to\n' +
			`${PROJECT} — that removes the gate instead of satisfying it.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());
