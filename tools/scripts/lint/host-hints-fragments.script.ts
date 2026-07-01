#!/usr/bin/env bun
/**
 * host-hints-fragments.script.ts — f00083 S3 + f00092.
 *
 * Verify the single auto-generated host-instructions fragment
 * (docs/mcp-vertex/host-hints/agent-instructions.generated.md)
 * follows the same single-source-of-truth contract as the host
 * instruction files (see host-instructions.script.ts, f00083 S1):
 *
 *   1. The fragment must exist on disk and contain the
 *      BEGIN/END GENERATED markers. A hand edit makes the
 *      fragment stale — the only way to fix it is to run
 *      `bun run catalog:hints`.
 *
 *   2. The fragment must contain a link to
 *      docs/mcp-vertex/AGENT-BOOTSTRAP.md. The fragment is a
 *      pointer to the bootstrap; without the link it cannot
 *      fulfil its role.
 *
 *   3. The fragment must not enumerate skill / tool / proposal
 *      ids. Tools are served live by `mcp-vertex_agent_catalog`,
 *      skills live in packages/core/skills/manifest.json, and
 *      proposal ids live in docs/mcp-vertex/proposals/. Inlining
 *      any of those into a fragment makes it rot the moment the
 *      catalog changes.
 *
 * f00092: the single-fragment invariant. The output dir
 * (docs/mcp-vertex/host-hints/) MUST hold exactly one
 * `*.generated.md` file. Any sibling is a hand-split attempt to
 * revive the old per-host footnote model and the lint fails
 * with an actionable fix message.
 *
 * Usage:
 *   bun tools/scripts/lint/host-hints-fragments.script.ts
 *   bun tools/scripts/lint/host-hints-fragments.script.ts --check
 *
 * Exit codes: 0 = clean; 1 = one or more violations.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	lintHostFile,
	type IHostViolation,
} from './host-instructions.script.ts';

// f00092: collapsed from 3 to 1. The host-specific footnote now lives
// inline in each hand-edited host file (between <!-- mcp-vertex:begin -->
// and <!-- mcp-vertex:end -->); the fragment is the same for every host.
export const HOST_HINT_FRAGMENTS: readonly string[] = [
	'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
];

// f00092: the canonical filename is exported so the renderer and the
// lint agree on what counts as the single fragment.
export { HOST_INSTRUCTIONS_FILENAME } from '../catalog/render-host-hints.script.ts';

const HOST_HINTS_DIR = 'docs/mcp-vertex/host-hints';

const BEGIN_MARKER = '<!-- BEGIN GENERATED:';
const END_MARKER = '<!-- END GENERATED:';

const STALE_FIX =
	'Run `bun run catalog:hints` to regenerate the fragment from the live tool registry. Do not hand-edit: the file is overwritten on every render.';

export interface IFragmentLintResult {
	readonly file: string;
	readonly violations: readonly IHostViolation[];
	readonly exists: boolean;
}

export const lintHostHintFragment = async (
	file: string,
	workspaceRoot: string,
	skillIds?: ReadonlySet<string>,
): Promise<IFragmentLintResult> => {
	const abs = resolve(workspaceRoot, file);
	if (!existsSync(abs)) {
		return {
			file,
			exists: false,
			violations: [
				{
					file,
					line: 1,
					kind: 'missing-bootstrap-link',
					snippet: '<file not found>',
					fix: STALE_FIX,
				},
			],
		};
	}
	const contentViolations = await lintHostFile(file, workspaceRoot, skillIds);
	const { readFile } = await import('node:fs/promises');
	const text = await readFile(abs, 'utf8');
	const extraViolations: IHostViolation[] = [];
	if (!text.includes(BEGIN_MARKER) || !text.includes(END_MARKER)) {
		extraViolations.push({
			file,
			line: 1,
			kind: 'skill-id-enumeration',
			snippet: '<missing BEGIN/END GENERATED markers>',
			fix: STALE_FIX,
		});
	}
	return {
		file,
		exists: true,
		violations: [...contentViolations, ...extraViolations],
	};
};

export const lintAllHostHintFragments = async (
	workspaceRoot: string,
	skillIds?: ReadonlySet<string>,
): Promise<readonly IFragmentLintResult[]> => {
	return Promise.all(
		HOST_HINT_FRAGMENTS.map((f) =>
			lintHostHintFragment(f, workspaceRoot, skillIds),
		),
	);
};

const main = async (): Promise<number> => {
	const args = new Set(process.argv.slice(2));
	const isCheck = args.has('--check');
	const workspaceRoot = process.cwd();
	const results = await lintAllHostHintFragments(workspaceRoot);
	const strayViolations = await lintStrayFragments(workspaceRoot);
	const allViolations = [
		...results.flatMap((r) =>
			r.violations.map((v) => ({ ...v, file: r.file })),
		),
		...strayViolations,
	];
	if (allViolations.length === 0) {
		const summary = results
			.map((r) => `${basename(r.file)}: ${r.exists ? 'present' : 'MISSING'}`)
			.join(', ');
		console.log(`✓ host-hints-fragments: ${summary}; all canonical.`);
		return 0;
	}
	console.error('host-hints-fragments: BLOCKING violations:');
	for (const v of allViolations) {
		console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.snippet}`);
		console.error(`    fix: ${v.fix}`);
	}
	console.error(
		`\nhost-hints-fragments: ${allViolations.length} violation(s) across ${results.length} fragment(s).`,
	);
	return isCheck ? 0 : 1;
};

export interface IStrayFragment {
	readonly filename: string;
}

/**
 * f00092: walk the host-hints dir and return any `*.generated.md`
 * that is NOT the canonical single fragment. An empty result means
 * the single-fragment invariant is intact.
 */
export const findStrayFragments = async (
	workspaceRoot: string,
): Promise<readonly IStrayFragment[]> => {
	const dir = resolve(workspaceRoot, HOST_HINTS_DIR);
	const entries = await readdir(dir).catch(() => []);
	return entries
		.filter(
			(name) =>
				name.endsWith('.generated.md') &&
				name !== 'agent-instructions.generated.md',
		)
		.sort()
		.map((filename) => ({ filename }));
};

export const lintStrayFragments = async (
	workspaceRoot: string,
): Promise<readonly IHostViolation[]> => {
	const strays = await findStrayFragments(workspaceRoot);
	return strays.map((s) => ({
		file: `${HOST_HINTS_DIR}/${s.filename}`,
		line: 1,
		kind: 'stray-fragment' as const,
		snippet: `unexpected *.generated.md sibling: ${s.filename}`,
		fix:
			'f00092: delete the stray fragment and migrate its content into the canonical `agent-instructions.generated.md` and the hand-edited host files (see f00092-host-hints-single-fragment).',
	}));
};

const basename = (p: string): string => {
	const parts = p.split('/');
	return parts[parts.length - 1] ?? p;
};

if (import.meta.main) {
	process.exit(await main());
}
