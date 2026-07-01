#!/usr/bin/env bun
/**
 * render-host-hints.script.ts — render the canonical host-instruction
 * fragment that the hand-edited host files (`.github/copilot-instructions.md`,
 * `CLAUDE.md`, `AGENTS.md`) reference by path.
 *
 * The contract this script enforces (the "agnostic bootstrap" model):
 *
 *   1. Every host file MUST point at `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
 *      (the single source of truth for orient / discover / close / invariants).
 *   2. The fragment this script writes DOES NOT enumerate tools, skills, or
 *      proposal ids. The server is the only source of truth for that — the
 *      agent asks `mcp-vertex_agent_catalog` instead of reading a stale list.
 *   3. The fragment exists so a downstream project that copies the host-file
 *      shape still gets a deterministic, drift-detectable include. The
 *      host-file templates still include the bootstrap by reference; this
 *      generator only emits the fragment under `docs/mcp-vertex/host-hints/`.
 *
 * f00092: there is EXACTLY ONE fragment. The 3-fragment model (copilot,
 * claude, agents) collapsed because the only host-specific content was
 * a 1-line footnote pointing at an appendix in the canonical bootstrap
 * itself — that footnote now lives inline in each hand-edited host
 * file (between the `<!-- mcp-vertex:begin -->` /
 * `<!-- mcp-vertex:end -->` markers), where the rest of the host
 * file already lives. The script guards the single-fragment invariant
 * with a final directory walk that fails loudly if anyone tries to
 * re-split it.
 *
 * The script is intentionally minimal. It does NOT read the catalog
 * artifact (the old design did, and the result was a hand-maintained list
 * of ids that drifted every week). All it does is write a constant
 * fragment that says "follow the bootstrap, ask the server".
 *
 * Usage:
 *   bun tools/scripts/catalog/render-host-hints.script.ts
 *   bun tools/scripts/catalog/render-host-hints.script.ts --check
 *   bun tools/scripts/catalog/render-host-hints.script.ts --root /abs/path
 *
 * Exit codes:
 *   0 — fragment written or already up to date
 *   1 — fragment is stale under --check, or single-fragment invariant violated
 *   2 — invocation or load error
 */
import { join, resolve } from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';

export const DEFAULT_OUTPUT_DIR = 'docs/mcp-vertex/host-hints';
export const BOOTSTRAP_PATH = 'docs/mcp-vertex/AGENT-BOOTSTRAP.md';

// S5 raised the budget from 1 200 to 1 300 to match the agent-catalog budget
// (docs/mcp-vertex/AGENT-BOOTSTRAP.md is the canonical reference and the
// fragment is intentionally minimal but still has to point at it; the 100B
// headroom keeps the budget honest). f00092: the single fragment is even
// smaller than the old 3 fragments (~700B vs. ~1100B), so the 1300B budget
// is naturally respected and was not lowered to avoid noisy churn.
export const MAX_FRAGMENT_BYTES = 1_300;

// f00092: the single canonical fragment. The old design carried
// {id,filename,render} per host; the new design has one of each and
// guards the invariant with a directory walk (see `findStrayFragments`).
export const HOST_INSTRUCTIONS_FILENAME = 'agent-instructions.generated.md';
export const HOST_INSTRUCTIONS_ID = 'agent-instructions';

export interface IRenderedFragment {
	readonly id: typeof HOST_INSTRUCTIONS_ID;
	readonly filename: typeof HOST_INSTRUCTIONS_FILENAME;
	readonly text: string;
}

const SHARED_HEADER = [
	'<!-- Auto-generated host-instructions fragment. -->',
	'<!-- Regenerate with `bun run catalog:hints`. Do not edit by hand. -->',
	'',
	'<!-- BEGIN GENERATED: f00056 S4 (agnostic bootstrap). -->',
].join('\n');

const SHARED_FOOTER = [
	'<!-- END GENERATED: f00056 S4 (agnostic bootstrap). -->',
	'',
	'> This fragment is intentionally minimal. The universal agent rules live',
	`> in [\`${BOOTSTRAP_PATH}\`](${BOOTSTRAP_PATH}). Host files reference that`,
	'> file and add only the rules the server cannot enforce (e.g. the',
	'> status-marker close contract on Copilot, the keep-main-thread-cheap',
	'> rule on Claude Code). Tools, skills, and proposal ids are NEVER',
	'> enumerated here — they are served live by `mcp-vertex_agent_catalog`.',
].join('\n');

const renderFragment = (): string =>
	[
		SHARED_HEADER,
		'',
		'## Discovery',
		'',
		'Follow the universal bootstrap at',
		`[\`${BOOTSTRAP_PATH}\`](${BOOTSTRAP_PATH}). The canonical first move is`,
		'`mcp-vertex_overview { compact: true }` followed by',
		'`mcp-vertex_agent_catalog` whenever routing to a tool, skill, or',
		'actionable proposal.',
		'',
		SHARED_FOOTER,
	].join('\n');

export const renderHostHints = (
	_options: Record<string, never> = {},
): readonly IRenderedFragment[] => [
	{
		id: HOST_INSTRUCTIONS_ID,
		filename: HOST_INSTRUCTIONS_FILENAME,
		text: `${renderFragment()}\n`,
	},
];

const parseArgs = (
	argv: readonly string[],
): { check: boolean; root: string } => {
	let check = false;
	let root = process.cwd();
	for (const arg of argv) {
		if (arg === '--check') {
			check = true;
			continue;
		}
		if (arg.startsWith('--root=')) {
			root = arg.slice('--root='.length);
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			console.log(
				'Usage: bun render-host-hints.script.ts [--check] [--root=<path>]',
			);
			process.exit(0);
		}
	}
	return { check, root };
};

const compareText = (a: string, b: string): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
};

const readUtf8 = async (path: string): Promise<string> => {
	const file = Bun.file(path);
	if (!(await file.exists())) return '';
	return file.text();
};

/**
 * f00092: enforce the single-fragment invariant. The output dir
 * MUST hold exactly one `*.generated.md` file, and it MUST be the
 * canonical `agent-instructions.generated.md`. This catches a
 * hand-split (e.g. someone adding back `claude.generated.md` for
 * the old per-host footnote) before the lint even has to.
 *
 * Returns the list of unexpected filenames. Empty list = ok.
 */
export const findStrayFragments = async (
	outputDir: string,
): Promise<readonly string[]> => {
	const entries = await readdir(outputDir).catch(() => []);
	return entries
		.filter(
			(name) =>
				name.endsWith('.generated.md') &&
				name !== HOST_INSTRUCTIONS_FILENAME,
		)
		.sort();
};

const main = async (): Promise<number> => {
	const { check, root } = parseArgs(process.argv.slice(2));
	const outputDir = resolve(root, DEFAULT_OUTPUT_DIR);

	const rendered = renderHostHints({});
	const fragment = rendered[0];
	if (!fragment) {
		console.error('render-host-hints: no fragment produced.');
		return 2;
	}

	let allOk = true;
	if (!check) {
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
	}
	const target = join(outputDir, fragment.filename);
	const existing = await readUtf8(target);
	if (compareText(existing, fragment.text)) {
		console.log(
			`${fragment.id}: up to date (${fragment.text.length} bytes)`,
		);
	} else {
		if (check) {
			console.error(
				`${fragment.id}: stale (existing ${existing.length}B, would be ${fragment.text.length}B at ${target})`,
			);
			allOk = false;
		} else {
			await Bun.write(target, fragment.text);
			console.log(
				`${fragment.id}: wrote ${target} (${fragment.text.length} bytes)`,
			);
		}
	}

	const strays = await findStrayFragments(outputDir);
	if (strays.length > 0) {
		console.error(
			`${fragment.id}: stray fragments in ${outputDir}: ${strays.join(', ')}.`,
		);
		console.error(
			'  f00092: the host-hints directory MUST hold exactly one *.generated.md file.',
		);
		console.error(
			'  Delete the stray files, or migrate their content into the canonical fragment and the hand-edited host files (see f00092).',
		);
		allOk = false;
	}

	if (check && !allOk) {
		console.error(
			'host hints are stale or violate the single-fragment invariant — run `bun run catalog:hints` and commit.',
		);
		return 1;
	}
	if (!check && !allOk) {
		return 3;
	}
	if (!check) console.log('host hints regenerated.');
	return 0;
};

if (import.meta.main) {
	const code = await main();
	process.exit(code);
}

export const _internal = { parseArgs, compareText, main, findStrayFragments };
