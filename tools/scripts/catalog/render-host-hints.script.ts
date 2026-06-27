#!/usr/bin/env bun
/**
 * render-host-hints.script.ts — render the canonical host-instruction
 * fragments that the hand-edited host files (`.github/copilot-instructions.md`,
 * `CLAUDE.md`, `AGENTS.md`) reference by path.
 *
 * The contract this script enforces (the "agnostic bootstrap" model):
 *
 *   1. Every host file MUST point at `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
 *      (the single source of truth for orient / discover / close / invariants).
 *   2. The fragments this script writes DO NOT enumerate tools, skills, or
 *      proposal ids. The server is the only source of truth for that — the
 *      agent asks `mcp-vertex_agent_catalog` instead of reading a stale list.
 *   3. The fragments exist so a downstream project that copies the host-file
 *      shape still gets a deterministic, drift-detectable include. The
 *      host-file templates still include the bootstrap by reference; this
 *      generator only emits the fragments under `docs/mcp-vertex/host-hints/`.
 *
 * The script is intentionally minimal. It does NOT read the catalog
 * artifact (the old design did, and the result was a hand-maintained list
 * of ids that drifted every week). All it does is write a constant
 * fragment per host that says "follow the bootstrap, ask the server".
 *
 * Usage:
 *   bun tools/scripts/catalog/render-host-hints.script.ts
 *   bun tools/scripts/catalog/render-host-hints.script.ts --check
 *   bun tools/scripts/catalog/render-host-hints.script.ts --root /abs/path
 *
 * Exit codes:
 *   0 — fragments written or already up to date
 *   1 — fragments are stale under --check
 *   2 — invocation or load error
 */
import { dirname, join, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

export const DEFAULT_OUTPUT_DIR = 'docs/mcp-vertex/host-hints';
export const BOOTSTRAP_PATH = 'docs/mcp-vertex/AGENT-BOOTSTRAP.md';

// S5 raised the budget from 1 200 to 1 300 to match the agent-catalog budget
// (docs/mcp-vertex/AGENT-BOOTSTRAP.md is the canonical reference and the
// fragment is intentionally minimal but still has to point at it + a
// host-specific skill; the 100B headroom keeps the budget honest).
export const MAX_FRAGMENT_BYTES = 1_300;

export type HostId = 'copilot' | 'claude' | 'agents';

export interface IHostFragment {
	readonly id: HostId;
	readonly filename: string;
	readonly render: () => string;
}

const SHARED_HEADER = (hostLabel: string): string =>
	[
		`<!-- Auto-generated discovery fragment for ${hostLabel}. -->`,
		`<!-- Regenerate with \`bun run catalog:hints\`. Do not edit by hand. -->`,
		'',
		`<!-- BEGIN GENERATED: f00056 S4 (agnostic bootstrap). -->`,
	].join('\n');

const SHARED_FOOTER = [
	`<!-- END GENERATED: f00056 S4 (agnostic bootstrap). -->`,
	'',
	`> This fragment is intentionally minimal. The universal agent rules live`,
	`> in [\`${BOOTSTRAP_PATH}\`](${BOOTSTRAP_PATH}). Host files reference that`,
	`> file and add only the rules the server cannot enforce (e.g. the`,
	`> status-marker close contract on Copilot, the keep-main-thread-cheap`,
	`> rule on Claude Code). Tools, skills, and proposal ids are NEVER`,
	`> enumerated here — they are served live by \`mcp-vertex_agent_catalog\`.`,
].join('\n');

const CANONICAL_FIRST_MOVE_LINE_1 = 'Follow the universal bootstrap at';
const CANONICAL_FIRST_MOVE_LINE_2 =
	'`mcp-vertex_overview { compact: true }` followed by';
const CANONICAL_FIRST_MOVE_LINE_3 =
	'`mcp-vertex_agent_catalog` whenever routing to a tool, skill, or';
const CANONICAL_FIRST_MOVE_LINE_4 = 'actionable proposal.';

const HOST_FOOTNOTE: Readonly<Record<HostId, string>> = {
	copilot:
		'- Bootstrap appendix 8.1 (Copilot close-marker contract) is in effect.',
	claude: '- Bootstrap appendix 8.2 (keep the main thread cheap) is in effect.',
	agents: '- Bootstrap section 7 (repo-level rules) is in effect.',
};

const renderFragment = (id: HostId, hostLabel: string): string =>
	[
		SHARED_HEADER(hostLabel),
		'',
		'## Discovery',
		'',
		CANONICAL_FIRST_MOVE_LINE_1,
		`[\`${BOOTSTRAP_PATH}\`](${BOOTSTRAP_PATH}). The canonical first move is`,
		CANONICAL_FIRST_MOVE_LINE_2,
		CANONICAL_FIRST_MOVE_LINE_3,
		CANONICAL_FIRST_MOVE_LINE_4,
		'',
		'## Host-specific footnote',
		'',
		HOST_FOOTNOTE[id],
		SHARED_FOOTER,
	].join('\n');

const renderCopilotFragment = (): string =>
	renderFragment('copilot', 'GitHub Copilot Chat');
const renderClaudeFragment = (): string =>
	renderFragment('claude', 'Claude Code');
const renderAgentsFragment = (): string =>
	renderFragment(
		'agents',
		'AGENTS-compatible hosts (Cursor, Aider, generic)',
	);

export const HOST_FRAGMENTS: readonly IHostFragment[] = [
	{
		id: 'copilot',
		filename: 'copilot-instructions.generated.md',
		render: renderCopilotFragment,
	},
	{
		id: 'claude',
		filename: 'claude.generated.md',
		render: renderClaudeFragment,
	},
	{
		id: 'agents',
		filename: 'agents.generated.md',
		render: renderAgentsFragment,
	},
];

export interface IRenderHostHintsOptions {
	readonly outputDir?: string;
}

export interface IRenderedFragment {
	readonly id: HostId;
	readonly filename: string;
	readonly text: string;
}

export const renderHostHints = (
	_options: IRenderHostHintsOptions = {},
): readonly IRenderedFragment[] =>
	HOST_FRAGMENTS.map((fragment) => ({
		id: fragment.id,
		filename: fragment.filename,
		text: `${fragment.render()}\n`,
	}));

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

const main = async (): Promise<number> => {
	const { check, root } = parseArgs(process.argv.slice(2));
	const outputDir = resolve(root, DEFAULT_OUTPUT_DIR);

	const rendered = renderHostHints({});

	let allOk = true;
	if (!check) {
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
	}
	for (const fragment of rendered) {
		const target = join(outputDir, fragment.filename);
		const existing = await readUtf8(target);
		if (compareText(existing, fragment.text)) {
			console.log(
				`${fragment.id}: up to date (${fragment.text.length} bytes)`,
			);
			continue;
		}
		if (check) {
			console.error(
				`${fragment.id}: stale (existing ${existing.length}B, would be ${fragment.text.length}B at ${target})`,
			);
			allOk = false;
			continue;
		}
		await Bun.write(target, fragment.text);
		console.log(
			`${fragment.id}: wrote ${target} (${fragment.text.length} bytes)`,
		);
	}

	if (check && !allOk) {
		console.error(
			'host hints are stale — run `bun run catalog:hints` and commit.',
		);
		return 1;
	}
	if (!check) console.log('host hints regenerated.');
	return 0;
};

if (import.meta.main) {
	const code = await main();
	process.exit(code);
}

export const _internal = { parseArgs, compareText, main };
export type { IHostFragment as _IHostFragment };
