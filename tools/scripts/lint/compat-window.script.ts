#!/usr/bin/env bun
/**
 * compat-window.script.ts — f00152 S4 (L2 — compat-window lint).
 *
 * The compat-window is a facade-only affordance: a tool outside the
 * facade should never import `v1Schema` / `translateV1toV2`. If a
 * non-facade tool does, it is a signal that the tool should be
 * promoted to the facade, not that the compat window should
 * silently leak.
 *
 * This lint walks the `plugins/<name>/src/lib/tools/<x>.tool.ts` tree and fails when:
 *   1. A non-facade tool file imports a known compat-window helper
 *      (`parseWithCompatWindow`, `defineCompatWindow`,
 *      `PROPOSAL_TRANSITION_COMPAT`).
 *   2. A non-facade tool file imports a `*.compat.ts` module (the
 *      convention for per-tool compat wrappers).
 *
 * SOLID notes:
 *   - **Pure over inputs** (`lintCompatWindow`): takes a list of
 *     facade tool names and a list of `(absPath, imports)` tuples.
 *     Returns a verdict. No I/O.
 *   - **Adapter**: `walkToolImports` scans the filesystem and
 *     extracts import statements.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const REPO_ROOT = process.cwd();
const PLUGINS_ROOT = 'plugins';

/** Curated set of tools on the f00152 stable facade. Mirrors STABLE_API_TOOL_NAMES. */
export const FACADE_TOOLS: readonly string[] = Object.freeze([
	'proposal_transition',
	'proposal_create',
	'auto_work',
	'agent_lock',
	'agent_worktree',
	'proposal_review',
	'task_queue_enqueue',
	'state_repair',
	'proposal_force_transition',
	'proposal_transition_compat',
]);

/** Helpers that should NEVER leak outside the facade. */
export const COMPAT_HELPERS: readonly RegExp[] = Object.freeze([
	/parseWithCompatWindow/,
	/defineCompatWindow/,
	/PROPOSAL_TRANSITION_COMPAT/,
	/proposal-transition\.compat/,
	/compat-window/,
]);

export interface ICompatWindowViolation {
	readonly absPath: string;
	readonly importName: string;
	readonly matchedHelper: string;
}

export interface ICompatWindowVerdict {
	readonly ok: boolean;
	readonly violations: readonly ICompatWindowViolation[];
}

/**
 * Pure lint over a list of `(absPath, imports)` tuples. A file is
 * considered "on the facade" if its `absPath` basename matches a
 * facade tool's kebab-cased name — `.tool.ts` for the handler or
 * `.compat.ts` for the wrapper.
 */
export const lintCompatWindow = (
	files: readonly {
		readonly absPath: string;
		readonly imports: readonly string[];
	}[],
): ICompatWindowVerdict => {
	const violations: ICompatWindowViolation[] = [];
	for (const file of files) {
		const kebabFacades = FACADE_TOOLS.map((tool) =>
			tool.replace(/_/g, '-'),
		);
		const isFacade = kebabFacades.some(
			(kebab) =>
				file.absPath.endsWith(`/${kebab}.tool.ts`) ||
				file.absPath.endsWith(`/${kebab}.compat.ts`),
		);
		if (isFacade) continue;
		for (const importName of file.imports) {
			for (const helper of COMPAT_HELPERS) {
				if (helper.test(importName)) {
					violations.push({
						absPath: file.absPath,
						importName,
						matchedHelper: helper.source,
					});
				}
			}
		}
	}
	return { ok: violations.length === 0, violations };
};

const IMPORT_LINE_RE = /^\s*import\s+[^;]+from\s+['"]([^'"]+)['"]/gm;

const walkToolFiles = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		const entries = await readdir(current, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			const abs = join(current, entry.name);
			// Skip build outputs so dist/.d.ts shims emitted by `bun run build`
			// (which mirror the source imports) do not double-count
			// facade-only compat helpers as leaks.
			if (entry.isDirectory()) {
				if (
					entry.name === 'dist' ||
					entry.name === 'node_modules' ||
					entry.name === '.cache'
				)
					continue;
				stack.push(abs);
			} else if (entry.isFile() && extname(entry.name) === '.ts') {
				out.push(abs);
			}
		}
	}
	return out;
};

const extractImports = (source: string): readonly string[] => {
	const imports: string[] = [];
	IMPORT_LINE_RE.lastIndex = 0;
	while (true) {
		const match = IMPORT_LINE_RE.exec(source);
		if (match === null) break;
		if (typeof match[1] === 'string') imports.push(match[1]);
	}
	return imports;
};

const main = async (): Promise<number> => {
	const toolsRoot = join(REPO_ROOT, PLUGINS_ROOT);
	const files = await walkToolFiles(toolsRoot);
	const inputs: { absPath: string; imports: readonly string[] }[] = [];
	for (const abs of files) {
		if (!abs.includes('/tools/')) continue;
		if (abs.endsWith('.spec.ts') || abs.endsWith('.test.ts')) continue;
		const source = await readFile(abs, 'utf8').catch(() => '');
		inputs.push({ absPath: abs, imports: extractImports(source) });
	}
	const verdict = lintCompatWindow(inputs);
	if (!verdict.ok) {
		for (const violation of verdict.violations) {
			process.stderr.write(
				`[compat-window] ${violation.absPath}: non-facade tool imports compat-window helper "${violation.matchedHelper}" (from "${violation.importName}")\n`,
			);
		}
		process.stderr.write(
			`[compat-window] ${verdict.violations.length} violation(s). Promote the tool to STABLE_API_TOOLS or drop the compat import.\n`,
		);
		return 1;
	}
	process.stdout.write(
		`✓ compat-window: no compat helpers leaked outside the facade\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
