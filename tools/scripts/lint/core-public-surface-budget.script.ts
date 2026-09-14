#!/usr/bin/env bun

import { parseBarrel } from '../inspect/core-public-inventory.script';

// Raised by one, deliberately, for `announceLines`: it REMOVES four
// duplicated copies of the same never-throw stderr write loop (two of
// them in plugins, which `lint:solid` flags as cross-plugin
// duplication). Spending a public export to delete four copies of a
// safety guarantee is the trade this budget exists to make consciously.
//
// Raised by eight more (2026-09-04) for q00017's capability ontology and
// host capability registry. This is the trade the budget exists to force
// out into the open, so here it is: the eight exports replace TWO
// detectors that answered the same question with different shapes —
// `analyze-project` and `detect-stack` — and the eight canonical types
// are what let the second become a projection of the first instead of a
// rival source of truth. A public surface that grows to delete a
// duplicate truth is worth more than one that stays small by keeping it.
//
// Raised by 64 more (2026-09-07) for x00510 S1.5: the
// workspace-migration public re-exports (DEFAULT_MIGRATIONS,
// runPendingMigrations, ensureWorkspaceMigrated, the manifest helpers,
// the transaction functions, and scanLegacyIdentity) were promoted
// from @delendai/core/lib/* internals into the public barrel so the
// CLI / migrate command / rebrand-propagate script can consume them
// through the documented surface — required to clear the cli-imports
// gate that was blocking every agent in the workspace. The trade is
// the documented one this budget exists to force out: a small growth
// of the public surface in exchange for a real consolidation (CLI
// files no longer reach into private internals).
//
// Raised by 31 more (2026-09-09) for f00418 / x00528 / x00504 / q00014
// follow-up work: the shell-status tool primitives, the safe-rename
// and safe-list-dir helpers, withFileMutexes, the host-capability
// adapter contract, and the IWalkTsFilesOptions type. Each one
// replaces a private-internals import previously scattered across
// plugins / scripts / extension — the same consolidation pattern the
// budget exists to support.
// Raised by 11 (2026-09-10), and the interesting half of that number is
// the 44 exports removed to get there.
//
// The gate came in 55 OVER at 909. The development policy, the WIP ref
// engine, the startup gate and the reconciler had each published their
// whole vocabulary through the barrel — every strategy union, every
// `IPolicy*` slice, every seam interface, every startup phase constant.
// The rationale written above the block said "the runtime, the guards,
// the generated forge governance and the tooling all have to read the
// SAME resolved answer". A sweep of plugins/, apps/, tools/,
// extensions/ and the sibling packages found ZERO importers for about
// sixty of them. They were published in anticipation of a caller, which
// is exactly what this budget exists to notice.
//
// So: 909 -> 865 by unpublishing the ones with no caller, and the 12
// that remain (IResolvedDevelopmentPolicy, IStartupStatePorts,
// createOrUpdateWipRef, createStartupGovernanceSeam, createWipEngine,
// expandProfile, renderStartupGate, resolveDevelopmentPolicy,
// resolveWorkRef, runStartupGate, startupGateWarnings,
// validateDevelopmentPolicy) each have a named consumer outside this
// package. That is the trade in the open: eleven more exports, each one
// bound to a caller rather than to an intention.
//
// Worth recording for whoever reads this next, because it is a bigger
// number than any bump here: 576 of the 865 exports have no importer
// anywhere in this repository, and 59 are referenced nowhere outside
// `packages/core` at all. `@delendai/core` is a published package, so
// "no in-repo importer" is not proof of dead — but 59 with no reference
// of any kind is worth a look. See x00541.
//
// Raised to 887 (2026-09-14), and only four of those twenty-two are new
// surface. Nine were ALWAYS there and this gate could not see them.
//
// `parseBarrel` splits the barrel on `;` and requires each statement to
// start with `export`, so a JSDoc block written above an export became
// part of that statement and the match failed — every name in the block
// vanished from the inventory. Documenting an export removed it from the
// number this budget gates on: `IResolvedDevelopmentPolicy`,
// `createIntegrationEngine`, `declareWorkflow`, `isLockEntryExpired`,
// `isLockEntryOrphaned`, `isLockEntryStale`, `renderWorkflowDeclaration`,
// `runIntegrationCycle`, `runLocalMergeCycle`. Found while ADDING
// comments, which is the only way anybody was ever going to find it.
//
// The rest is the integration engine and the workflow declaration,
// published so an adopting project can land work at all — this
// repository lands work with `forge:publish`, a script that ships
// nowhere, so it never noticed that every other project got half a work
// model. They carry an `@adopter-api` note now, which is the new gate's
// way of saying "no in-repo caller, deliberately".
//
// And the number stops being the only question asked:
// `lint:core-public-consumers` (x00541 S2) refuses a NEW export that has
// neither a caller in this repository nor that note. A count could never
// tell an API from an accident; sixty exports published in anticipation
// of a caller crossed this line only because they arrived together.
// Raised by one (2026-09-14) for `startCheckoutHydration`, and the trade
// is the one this budget exists to force into the open.
//
// A boot happens once; pull requests land all afternoon. The reconciler
// could already advance a shared checkout the forge had moved past, and
// did it at boot — after which the checkout fell four commits behind
// again within the hour, because git has no hook for "a remote moved"
// and the forge cannot push into a laptop. Only a long-lived local
// process can look, and that process is a host.
//
// So the export is bound to a caller (`tools/scripts/host`), not to an
// intention. The alternative was a deep import into
// `@delendai/core/lib/*`, which `lint:no-internal-core-imports` refuses
// for host and CLI code — correctly: a host reaching into internals is
// how a private seam becomes a de facto API without anybody deciding it.
//
// One symbol and not three: the host has a git runner and a resolved
// policy, so `startCheckoutHydration` assembles the seam itself rather
// than publishing a seam factory, a cadence constant and a watch to say
// the same thing.
// Corrected to 1097 (2026-09-14). The public surface did not grow by
// 209 — the gate's eyesight did.
//
// The ledger above already records one way a comment could delete
// exports from this count (a JSDoc block, fixed). The fix left line
// comments alone on the stated grounds that they "cannot swallow the
// export keyword, because the newline that ends them survives until the
// flattening below". That is false, and the flattening is exactly what
// makes it false: it removes the newline, so the comment's text lands
// inside the statement. One `;` written in prose splits the statement
// in two, neither half starts with `export`, and every name in that
// block leaves the inventory. Measured while adding a single
// explanatory comment to one export block: 887 -> 883.
//
// Removing line comments before parsing shows what was always
// published: 1097 exports, not 887. TWO gates read this inventory, so
// those ~210 symbols were invisible to the consumer gate as well — they
// could be added, and their callers questioned, by nobody.
//
// This is a correction, not a raise, and the difference is that the
// number now measures something. `parseBarrelText` is split out and the
// rule is pinned by cases, including the semicolon that caused this, so
// the next comment cannot move it again.
//
// It also surfaces real debt rather than hiding it: 115 of the newly
// visible exports have no caller in this repository and no
// `@adopter-api` note, and they are recorded as such in
// `core-public-consumers.baseline.json`. The instruction that has
// always applied to this number applies to the true one: it may only go
// down.
export const DEFAULT_MAX_CORE_PUBLIC_EXPORTS = 1097;

export interface ICorePublicSurfaceBudgetReport {
	readonly ok: boolean;
	readonly actual: number;
	readonly max: number;
	readonly excess: number;
	readonly message: string;
}

interface IMainOptions {
	readonly argv?: readonly string[];
	readonly countExports?: () => Promise<number>;
	readonly stdout?: Pick<typeof process.stdout, 'write'>;
	readonly stderr?: Pick<typeof process.stderr, 'write'>;
}

const parseMax = (argv: readonly string[]): number | null => {
	for (const token of argv) {
		if (!token.startsWith('--max=')) continue;
		const raw = token.slice('--max='.length).trim();
		const value = Number(raw);
		if (!Number.isInteger(value) || value < 0) return null;
		return value;
	}
	return DEFAULT_MAX_CORE_PUBLIC_EXPORTS;
};

export const evaluateCorePublicSurfaceBudget = (
	actual: number,
	max: number,
): ICorePublicSurfaceBudgetReport => {
	const excess = Math.max(0, actual - max);
	if (actual <= max) {
		return {
			ok: true,
			actual,
			max,
			excess,
			message: `core-public-surface-budget: ${actual}/${max} exports within budget.`,
		};
	}
	return {
		ok: false,
		actual,
		max,
		excess,
		message: `core-public-surface-budget: ${actual} exports exceeds budget ${max} by ${excess}. Reduce packages/core/src/public/index.ts or raise the limit deliberately.`,
	};
};

export const countCorePublicExports = async (): Promise<number> => {
	const exports = await parseBarrel();
	return exports.length;
};

export const main = async ({
	argv = process.argv.slice(2),
	countExports = countCorePublicExports,
	stdout = process.stdout,
	stderr = process.stderr,
}: IMainOptions = {}): Promise<number> => {
	const max = parseMax(argv);
	if (max === null) {
		stderr.write(
			'core-public-surface-budget: invalid --max value; expected a non-negative integer.\n',
		);
		return 2;
	}
	const actual = await countExports();
	const report = evaluateCorePublicSurfaceBudget(actual, max);
	const writer = report.ok ? stdout : stderr;
	writer.write(`${report.message}\n`);
	return report.ok ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
