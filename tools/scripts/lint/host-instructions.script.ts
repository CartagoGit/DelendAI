#!/usr/bin/env bun
/**
 * host-instructions.script.ts — f00084 S1.
 *
 * Enforce the "single source of truth" contract for the three canonical
 * host instruction files (`AGENTS.md`, `CLAUDE.md`,
 * `.github/copilot-instructions.md`):
 *
 *   1. Each host file MUST contain a link to `docs/mcp-vertex/AGENT-BOOTSTRAP.md`.
 *      Without the link, the host is not anchored to the central rule source.
 *
 *   2. Each host file MUST NOT enumerate skill / tool / proposal ids.
 *      Only the three bootstrap entry points are allowed as tool names
 *      (`mcp-vertex_overview`, `mcp-vertex_agent_catalog`,
 *      `mcp-vertex_agent_bootstrap`). Skill ids follow the kebab-case
 *      convention `mcp-vertex-*` and are listed in the skill manifest,
 *      not the host file. Proposal ids follow `[a-z]\d{5}` and live in
 *      `docs/mcp-vertex/proposals/`, not the host file.
 *
 *   3. Any failure outputs a per-file `BLOCKING` list with line numbers
 *      and a next-action that points at the bootstrap.
 *
 * Usage:
 *   bun tools/scripts/lint/host-instructions.script.ts
 *   bun tools/scripts/lint/host-instructions.script.ts --check
 *
 * Exit codes:
 *   0 — all host files comply
 *   1 — one or more files violate the contract
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const BOOTSTRAP_PATH = 'docs/mcp-vertex/AGENT-BOOTSTRAP.md';

/** The three bootstrap entry points that the renderer accepts. */
const ALLOWED_TOOL_NAMES = new Set([
	'mcp-vertex_overview',
	'mcp-vertex_agent_catalog',
	'mcp-vertex_agent_bootstrap',
]);

/**
 * Skill id pattern: matches anything that *looks* like a kebab-case skill id.
 * The lint narrows matches to those that appear in `packages/core/skills/manifest.json`,
 * so lints and scripts with similar shapes (e.g. `check-ephemeral-paths`) do
 * not trigger false positives.
 */
const SKILL_ID_PATTERN = /`[a-z][a-z0-9-]*-[a-z][a-z0-9-]+`/g;

const SKILL_MANIFEST_PATH = 'packages/core/skills/manifest.json';

/**
 * Tool name pattern: backtick-quoted `mcp-vertex_<suffix>`.
 * We allow the three bootstrap entry points explicitly.
 */
const TOOL_NAME_PATTERN = /`mcp-vertex_[a-z_]+`/g;

/**
 * Proposal id pattern: backtick-quoted `[a-z]\d{5}`.
 */
const PROPOSAL_ID_PATTERN = /`[a-z]\d{5}`/g;

export const HOST_FILES: readonly string[] = [
	'AGENTS.md',
	'CLAUDE.md',
	'.github/copilot-instructions.md',
];

export interface IHostViolation {
	readonly file: string;
	readonly line: number;
	readonly kind:
		| 'missing-bootstrap-link'
		| 'skill-id-enumeration'
		| 'tool-id-enumeration'
		| 'proposal-id-enumeration';
	readonly snippet: string;
	readonly fix: string;
}

const TOOL_FIX = (toolName: string): string =>
	`remove the inline reference to \`${toolName}\`; the bootstrap already lists it under §2. Move the rule to ${BOOTSTRAP_PATH} or rephrase without naming a specific tool.`;

const SKILL_FIX = (skillId: string): string =>
	`remove the inline reference to \`${skillId}\`; skills are surfaced live by \`mcp-vertex_agent_catalog { section: "skills" }\`. Move any rule about when to use it to ${BOOTSTRAP_PATH}.`;

const PROPOSAL_FIX = (proposalId: string): string =>
	`remove the inline reference to \`${proposalId}\`; actionable proposals are surfaced live by \`mcp-vertex_agent_catalog { section: "proposals" }\`. Move any context about it to ${BOOTSTRAP_PATH}.`;

const MISSING_BOOTSTRAP_FIX = `add a link to ${BOOTSTRAP_PATH} in the first 30 lines. Without the link, the host file is not anchored to the central source of agent rules.`;

const findAllMatches = (
	text: string,
	pattern: RegExp,
): Array<{ line: number; snippet: string; match: string }> => {
	const lines = text.split('\n');
	const out: Array<{ line: number; snippet: string; match: string }> = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		const matches = line.match(pattern);
		if (matches) {
			for (const m of matches) {
				out.push({
					line: i + 1,
					snippet: line.trim().slice(0, 120),
					match: m,
				});
			}
		}
	}
	return out;
};

export const lintHostFile = async (
	file: string,
	workspaceRoot: string,
	skillIds?: ReadonlySet<string>,
): Promise<readonly IHostViolation[]> => {
	const abs = resolve(workspaceRoot, file);
	const text = await readFile(abs, 'utf8').catch(() => '');
	const violations: IHostViolation[] = [];
	// Auto-load the skill manifest when no explicit set is provided. The
	// skill-id rule must narrow matches against the live manifest so lints
	// with similar shapes (`check-ephemeral-paths`, `proposal-id-drift`, …)
	// do not trigger false positives — that narrowing only works when the
	// helper sees the real id set, so loading the manifest lazily is the
	// right default for direct callers and tests. `lintAllHostFiles`
	// pre-loads once and threads the set in explicitly to avoid the
	// per-file disk hit.
	const effectiveSkillIds = skillIds ?? (await loadSkillIds(workspaceRoot));

	// Rule 1: must contain a link to the bootstrap. We accept either a
	// bare path mention or a markdown link target.
	const hasBootstrapLink = text.includes(BOOTSTRAP_PATH);
	if (!hasBootstrapLink) {
		violations.push({
			file,
			line: 1,
			kind: 'missing-bootstrap-link',
			snippet: text.split('\n')[0]?.slice(0, 120) ?? '',
			fix: MISSING_BOOTSTRAP_FIX,
		});
	}

	// Rule 2a: skill ids — only emit if the matched id is in the manifest.
	for (const { line, snippet, match } of findAllMatches(
		text,
		SKILL_ID_PATTERN,
	)) {
		const inner = match.match(/`([a-z][a-z0-9-]*-[a-z][a-z0-9-]+)`/);
		const id = inner?.[1];
		if (id && effectiveSkillIds.has(id)) {
			violations.push({
				file,
				line,
				kind: 'skill-id-enumeration',
				snippet,
				fix: SKILL_FIX(id),
			});
		}
	}

	// Rule 2b: tool names (excluding the three bootstrap entry points)
	for (const { line, snippet, match } of findAllMatches(
		text,
		TOOL_NAME_PATTERN,
	)) {
		const inner = match.match(/`(mcp-vertex_[a-z_]+)`/);
		const toolName = inner?.[1];
		if (toolName && !ALLOWED_TOOL_NAMES.has(toolName)) {
			violations.push({
				file,
				line,
				kind: 'tool-id-enumeration',
				snippet,
				fix: TOOL_FIX(toolName),
			});
		}
	}

	// Rule 2c: proposal ids
	for (const { line, snippet, match } of findAllMatches(
		text,
		PROPOSAL_ID_PATTERN,
	)) {
		const inner = match.match(/`([a-z]\d{5})`/);
		if (inner) {
			violations.push({
				file,
				line,
				kind: 'proposal-id-enumeration',
				snippet,
				fix: PROPOSAL_FIX(inner[1] ?? ''),
			});
		}
	}

	return violations;
};

/** Load the canonical skill ids from the manifest so the lint does not
 *  flag lint-script names like `check-ephemeral-paths`. Returns an empty set
 *  if the manifest is missing (fail-open: better to skip the rule than to
 *  fail every host file when the manifest is intentionally absent). */
const loadSkillIds = async (
	workspaceRoot: string,
): Promise<ReadonlySet<string>> => {
	const abs = resolve(workspaceRoot, SKILL_MANIFEST_PATH);
	if (!existsSync(abs)) return new Set();
	const raw = await readFile(abs, 'utf8').catch(() => '');
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object') return new Set();
	const skills = (parsed as { skills?: unknown }).skills;
	if (!Array.isArray(skills)) return new Set();
	const ids = new Set<string>();
	for (const entry of skills) {
		if (entry && typeof entry === 'object' && 'id' in entry) {
			const id = (entry as { id?: unknown }).id;
			if (typeof id === 'string') ids.add(id);
		}
	}
	return ids;
};

export const lintAllHostFiles = async (
	workspaceRoot: string,
): Promise<readonly IHostViolation[]> => {
	const skillIds = await loadSkillIds(workspaceRoot);
	const all: IHostViolation[] = [];
	for (const file of HOST_FILES) {
		const violations = await lintHostFile(file, workspaceRoot, skillIds);
		all.push(...violations);
	}
	return all;
};

const formatViolations = (violations: readonly IHostViolation[]): string => {
	if (violations.length === 0) return '';
	const grouped = new Map<string, IHostViolation[]>();
	for (const v of violations) {
		const list = grouped.get(v.file) ?? [];
		list.push(v);
		grouped.set(v.file, list);
	}
	const lines: string[] = [];
	for (const [file, vs] of grouped) {
		lines.push(`  ${file}:`);
		for (const v of vs) {
			lines.push(`    line ${v.line} [${v.kind}] ${v.snippet}`);
			lines.push(`      → ${v.fix}`);
		}
	}
	return lines.join('\n');
};

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
		}
	}
	return { check, root };
};

const main = async (): Promise<number> => {
	const { check, root } = parseArgs(process.argv.slice(2));
	const violations = await lintAllHostFiles(root);
	if (violations.length === 0) {
		console.log(
			'host-instructions lint: 0 violations across',
			HOST_FILES.length,
			'files.',
		);
		return 0;
	}
	const header = `host-instructions lint: ${violations.length} violation(s) across ${new Set(violations.map((v) => v.file)).size} file(s).`;
	if (check) {
		console.error(header);
		console.error(formatViolations(violations));
		return 1;
	}
	console.log(header);
	console.log(formatViolations(violations));
	return 1;
};

if (import.meta.main) {
	const code = await main();
	process.exit(code);
}

export const _internal = { parseArgs, formatViolations, findAllMatches };
