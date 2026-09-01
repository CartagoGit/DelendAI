#!/usr/bin/env bun
/**
 * typecheck.script.ts — c00123 / a00067 S5 follow-up / AUD-A12.
 *
 * Wrapper around `tsc --noEmit` that supports one workspace-level opt-out:
 *   MCP_VERTEX_RELAX_EXACT_OPTIONAL=1  → use tsconfig.relax.json
 *                                       (sets exactOptionalPropertyTypes: false)
 *   unset / anything else              → use tsconfig.json
 *                                       (keeps exactOptionalPropertyTypes: true,
 *                                       the default since 2026-06)
 *
 * The flag adds friction for LLMs without lifting the runtime quality bar
 * (a00067 F3 / DC5); see `docs/mcp-vertex/AGENT-BOOTSTRAP.md` for the trade
 * note (c00123 S2). On by default, opt-out only.
 *
 * AUD-A12: `tsc -p tsconfig.json` never covered `tools/**` — 303 files /
 * 56k lines holding every lint, generator, verifier and CI script in the
 * repo, i.e. the code that decides whether the rest of the code passes.
 * `tools/tsconfig.json` already existed to cover it and nothing invoked
 * it. This script now also runs `tsc -p tools/tsconfig.json`, gated by a
 * per-file error-count ratchet baseline (same idiom as
 * `types-in-contracts.script.ts`): the 100+ pre-existing errors don't
 * block `validate`, but a file's count can only go DOWN, never up, and a
 * newly-erroring file fails immediately. `--update` rewrites the
 * baseline to the current counts (only ever run deliberately, after
 * actually fixing/reducing errors — never to paper over a regression).
 *
 * Acceptance (c00123 S1):
 *   - `MCP_VERTEX_RELAX_EXACT_OPTIONAL=1 npm run typecheck` succeeds with flag off.
 *   - Default run (env unset) keeps the flag ON and the project typechecks.
 *   - `bun run validate` is unchanged.
 *
 * Acceptance (AUD-A12):
 *   - `bun run typecheck` also runs `tools/tsconfig.json` and fails on any
 *     NEW error (a file whose count exceeds its baselined count, or a
 *     file with errors that isn't in the baseline at all).
 *   - `bun tools/scripts/typecheck.script.ts --update` rewrites
 *     `tools/tsconfig.baseline.json` to the current per-file counts.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { repoRoot } from './lib/monorepo-paths';

const RELAX_ENV = 'MCP_VERTEX_RELAX_EXACT_OPTIONAL';
const DEFAULT_PROJECT = 'tsconfig.json';
const RELAXED_PROJECT = 'tsconfig.relax.json';
const TOOLS_PROJECT = 'tools/tsconfig.json';
const TOOLS_BASELINE_REL = 'tools/tsconfig.baseline.json';

interface ITscResult {
	readonly status: number;
	readonly output: string;
}

type TscOutputMode = 'inherit' | 'capture';

interface ITypecheckOptions {
	readonly outputMode?: TscOutputMode;
}

const resolveProject = (): string => {
	const value = process.env[RELAX_ENV];
	const enabled = value === '1' || value === 'true';
	const project = enabled ? RELAXED_PROJECT : DEFAULT_PROJECT;
	if (enabled) {
		console.log(
			`[typecheck] ${RELAX_ENV}=${value} → using ${project} (exactOptionalPropertyTypes: false)`,
		);
	} else {
		console.log(
			`[typecheck] ${RELAX_ENV} unset → using ${project} (exactOptionalPropertyTypes: true, default)`,
		);
	}
	return project;
};

/**
 * Run `tsc --noEmit -p <projectPath>` and capture combined stdout+stderr.
 * `tsc` writes diagnostics to stdout; kept as a separate function (rather
 * than inlined `spawnSync`) purely so the exit path stays readable — it
 * has no logic of its own worth unit-testing in isolation.
 */
function runTsc(
	rootDir: string,
	projectPath: string,
	options: ITypecheckOptions = {},
): ITscResult {
	const outputMode = options.outputMode ?? 'capture';
	const result = spawnSync('bunx', ['tsc', '--noEmit', '-p', projectPath], {
		cwd: rootDir,
		...(outputMode === 'inherit'
			? { stdio: 'inherit' as const }
			: { encoding: 'utf8' as const }),
	});
	if (result.error) {
		console.error(
			`[typecheck] failed to spawn tsc: ${result.error.message}`,
		);
		return { status: 1, output: '' };
	}
	if (outputMode === 'inherit') {
		return { status: result.status ?? 1, output: '' };
	}
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	return { status: result.status ?? 1, output };
}

/**
 * Pure: parse `tsc`'s diagnostic lines into a per-file error count.
 * `tsc`'s default reporter prints one line per diagnostic as
 * `path/to/file.ts(line,col): error TS1234: message`; this only cares
 * about the leading file path, so line/column churn from unrelated
 * edits doesn't reshuffle the baseline — only the COUNT per file
 * matters, exactly like `types-in-contracts.script.ts`.
 */
export const parseTscErrorsByFile = (
	output: string,
): Record<string, number> => {
	const counts: Record<string, number> = {};
	for (const line of output.split('\n')) {
		const match = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(line);
		if (!match) continue;
		const file = match[1] as string;
		counts[file] = (counts[file] ?? 0) + 1;
	}
	return counts;
};

export const loadToolsBaseline = (rootDir: string): Record<string, number> => {
	const abs = resolve(rootDir, TOOLS_BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

export const writeToolsBaseline = (
	rootDir: string,
	counts: Record<string, number>,
): void => {
	const abs = resolve(rootDir, TOOLS_BASELINE_REL);
	writeFileSync(abs, `${JSON.stringify(counts, null, '\t')}\n`, 'utf8');
};

/**
 * Pure ratchet policy: a file regresses when its current error count
 * EXCEEDS the baselined count for that file (0 when the file isn't in
 * the baseline at all). Mirrors `types-in-contracts.script.ts`'s
 * `regressions` computation so both ratchets in this repo behave the
 * same way for a human reading the failure output.
 */
export const computeToolsRegressions = (
	current: Record<string, number>,
	baseline: Record<string, number>,
): readonly string[] => {
	const regressions: string[] = [];
	for (const [file, count] of Object.entries(current)) {
		const allowed = baseline[file] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${file}: ${count} error(s) (baseline ${allowed})`,
			);
		}
	}
	return regressions;
};

const totalCount = (counts: Record<string, number>): number =>
	Object.values(counts).reduce((a, b) => a + b, 0);

/**
 * Run `tsc -p tools/tsconfig.json` and apply the ratchet. Returns the
 * process exit code for this step (0 = clean or fully baselined).
 */
const hasUpdateFlag = (args: readonly string[]): boolean =>
	args.includes('--update');

function runToolsTypecheck(rootDir: string, args: readonly string[]): number {
	const projectPath = resolve(rootDir, TOOLS_PROJECT);
	const result = runTsc(rootDir, projectPath);
	const { output } = result;
	const current = parseTscErrorsByFile(output);

	if (result.status !== 0 && Object.keys(current).length === 0) {
		console.error(
			output.length > 0
				? output
				: '[typecheck:tools] tsc failed without parseable diagnostics.',
		);
		return 1;
	}

	if (hasUpdateFlag(args)) {
		writeToolsBaseline(rootDir, current);
		console.log(
			`[typecheck:tools] baseline updated — ${Object.keys(current).length} file(s), ${totalCount(current)} error(s).`,
		);
		return 0;
	}

	const baseline = loadToolsBaseline(rootDir);
	const regressions = computeToolsRegressions(current, baseline);
	const curTotal = totalCount(current);
	const baseTotal = totalCount(baseline);

	if (regressions.length > 0) {
		console.error(output);
		console.error(
			`[typecheck:tools] ✖ ${regressions.length} file(s) have MORE errors than the baseline allows:\n${regressions.join('\n')}\n\n` +
				`  Fix the regression, or if you deliberately reduced errors elsewhere, run\n` +
				`  \`bun tools/scripts/typecheck.script.ts --update\` to lock in the new floor.\n` +
				`  The baseline may only be RAISED as a deliberate, reviewed decision — never to hide a regression.\n`,
		);
		return 1;
	}

	if (curTotal < baseTotal) {
		console.log(
			`[typecheck:tools] ✓ no new errors; debt shrank ${baseTotal} → ${curTotal}. Run --update to lock in the win.`,
		);
		return 0;
	}
	console.log(
		`[typecheck:tools] ✓ no new tools/ errors (${curTotal} baselined across ${Object.keys(baseline).length} file(s)).`,
	);
	return 0;
}

// ──────────────────────────────────────────────────────────────────────────
// AUD-A12 "ideal fix", partial: a workspace↔project coverage check.
//
// The audit's ideal fix is to DERIVE the set of TypeScript projects from
// `package.json#workspaces` instead of a hand-maintained `include` list —
// the same root cause as AUD-A09 (lint scope) and AUD-A11 (workspace↔
// project map): restating a manifest by hand lets the two drift, and
// `tools/` drifting out of `tsconfig.json#include` is exactly how AUD-A12
// happened. Fully deriving `tsc`'s multi-project invocation from the
// manifest (project references, per-package tsconfig discovery, etc.) is
// a bigger refactor than this fix should carry. What ships here instead
// is the coverage TEST the audit explicitly asks for: it fails the day a
// declared workspace has TypeScript source files and no project covers
// them — which is precisely the shape of bug AUD-A12 was.
// ──────────────────────────────────────────────────────────────────────────

/** Pure: read `workspaces` out of a parsed `package.json`. */
export const readWorkspaceGlobs = (packageJson: {
	readonly workspaces?: readonly string[];
}): readonly string[] => packageJson.workspaces ?? [];

/**
 * Expand one `workspaces` glob entry to concrete, repo-relative
 * directories. Only the trailing `/*` shape used by this repo's
 * `package.json` is supported (e.g. `packages/*`) — a bare entry
 * (`tools`) expands to itself. Missing directories expand to nothing
 * rather than throwing, since a glob with no matches is valid npm/bun
 * workspace behaviour.
 */
export const expandWorkspaceGlob = (
	rootDir: string,
	glob: string,
): readonly string[] => {
	if (!glob.endsWith('/*')) return [glob];
	const base = glob.slice(0, -2);
	const absBase = join(rootDir, base);
	if (!existsSync(absBase)) return [];
	return readdirSync(absBase, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => `${base}/${e.name}`)
		.sort((a, b) => a.localeCompare(b));
};

/**
 * True when `relDir` (or anything under it) contains at least one
 * `.ts`/`.tsx` file. A workspace with zero TypeScript source (e.g.
 * `tools/docs-api`, which is package.json + README only) has nothing
 * for any project to cover, so it is vacuously fine to skip.
 */
export const dirHasTsFiles = (rootDir: string, relDir: string): boolean => {
	const stack: string[] = [relDir];
	while (stack.length > 0) {
		const rel = stack.pop() as string;
		const abs = join(rootDir, rel);
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = readdirSync(abs, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (
				entry.name === 'node_modules' ||
				entry.name === 'dist' ||
				entry.name === '.git'
			)
				continue;
			if (entry.isDirectory()) {
				stack.push(`${rel}/${entry.name}`);
			} else if (/\.tsx?$/.test(entry.name)) {
				return true;
			}
		}
	}
	return false;
};

/**
 * True when `relDir` is covered by SOME TypeScript project: either it
 * owns a `tsconfig.json` directly (the pattern every `packages/*` and
 * `apps/web` uses), or it falls under one of `rootIncludePatterns`
 * (the root `tsconfig.json#include` array) by prefix — computed against
 * the fixed portion of the glob before its first `*`, in both
 * directions, so both a wildcard `include` pattern for a per-plugin
 * `src` dir (where `relDir` is the shorter prefix) and a fixed one
 * like `apps/shared/src` (where the pattern is the shorter, more
 * specific, prefix) match correctly.
 */
export const isCoveredByTsProject = (
	rootDir: string,
	relDir: string,
	rootIncludePatterns: readonly string[],
): boolean => {
	if (existsSync(join(rootDir, relDir, 'tsconfig.json'))) return true;
	for (const pattern of rootIncludePatterns) {
		const starIdx = pattern.indexOf('*');
		const fixedPrefix =
			starIdx === -1 ? pattern : pattern.slice(0, starIdx);
		const relWithSlash = `${relDir}/`;
		if (
			relWithSlash.startsWith(fixedPrefix) ||
			fixedPrefix.startsWith(relWithSlash)
		) {
			return true;
		}
	}
	return false;
};

/**
 * Full coverage check over every declared workspace. Returns the
 * `relDir`s that have TypeScript source and are covered by NO project —
 * empty means every workspace with actual TS code is typechecked by
 * something. Exported so the spec can assert this against the live
 * repo manifest (and so a future full derivation can reuse the pieces).
 */
export const findUncoveredWorkspaces = (
	rootDir: string,
	workspaceGlobs: readonly string[],
	rootIncludePatterns: readonly string[],
): readonly string[] => {
	const uncovered: string[] = [];
	for (const glob of workspaceGlobs) {
		for (const relDir of expandWorkspaceGlob(rootDir, glob)) {
			if (!dirHasTsFiles(rootDir, relDir)) continue;
			if (!isCoveredByTsProject(rootDir, relDir, rootIncludePatterns)) {
				uncovered.push(relDir);
			}
		}
	}
	return uncovered;
};

export const runTypecheck = (
	args: readonly string[] = process.argv.slice(2),
): number => {
	const rootDir = repoRoot();
	const projectPath = resolve(rootDir, resolveProject());
	const mainStatus = runTsc(rootDir, projectPath, {
		outputMode: 'inherit',
	}).status;
	if (mainStatus !== 0) {
		// The root project has zero tolerance for errors — no baseline,
		// no ratchet. Fail fast without even running the tools/ pass.
		return mainStatus;
	}

	return runToolsTypecheck(rootDir, args);
};

if (import.meta.main) process.exit(runTypecheck());
