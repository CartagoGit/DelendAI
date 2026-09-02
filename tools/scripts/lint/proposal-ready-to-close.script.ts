#!/usr/bin/env bun
/**
 * proposal-ready-to-close.script.ts — R-2026-08-31.
 *
 * Lint that catches proposals sitting in `in-progress/` with all
 * slices `done` but a missing/empty `shipped-in:` frontmatter. Those
 * proposals are the canonical stuck state: the implementer shipped the
 * work, the peer-reviewer approved it, but nobody ever called
 * `proposals_proposal_transition { to: "done" }` (or it was rejected
 * because `guardShippedInPresent` requires `shipped-in:` in the
 * frontmatter). Without this lint the proposals accumulate indefinitely.
 *
 * For each finding the script renders:
 *  - the proposal id
 *  - the count of `done` slices vs total slices
 *  - whether `shipped-in:` is missing, empty, or populated
 *  - the next action the operator (or an agent) must take to close it
 *
 * The lint is advisory by default (exit 0) — it surfaces the
 * housekeeping debt without failing CI. Pass `--strict` to fail when
 * any proposal is reported (recommended for CI on `develop`).
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts --strict
 *   bun tools/scripts/lint/proposal-ready-to-close.script.ts --proposal=<id>
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../../plugins/proposals/src/lib/proposals/frontmatter-parser';
import { repoRoot } from '../lib/monorepo-paths';

const _PROPOSALS_ROOT = 'docs/mcp-vertex/proposals';
const PROPOSAL_FILENAME = /^[a-z]\d{5}-[a-z0-9-]+\.md$/;
const SCAN_DIRS: readonly string[] = ['in-progress'];

export type IReadyToCloseFinding = {
	readonly relPath: string;
	readonly proposalId: string;
	readonly totalSlices: number;
	readonly doneSlices: number;
	readonly shippedInState: 'missing' | 'empty' | 'invalid' | 'ok';
	readonly nextAction: string;
};

const walkMarkdown = (absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walkMarkdown(abs, out);
		else if (PROPOSAL_FILENAME.test(entry.name)) out.push(abs);
	}
};

const collectSliceStatuses = (
	markdown: string,
): { done: number; total: number } => {
	let done = 0;
	let total = 0;
	const re = /^\s*-\s*\*\*Status\*\*:\s*(\w+)\s*$/gm;
	for (const match of markdown.matchAll(re)) {
		const status = match[1] ?? '';
		// Only count slices in the `## Slices` block, not the proposal
		// summary table.
		total += 1;
		if (status === 'done') done += 1;
	}
	return { done, total };
};

const readFrontmatter = (markdown: string): Record<string, unknown> => {
	const block = extractYamlBlock(markdown);
	if (block === null) return {};
	return parseFrontmatterBlock(block) as Record<string, unknown>;
};

const shippedInState = (
	fm: Record<string, unknown>,
): IReadyToCloseFinding['shippedInState'] => {
	const list = fm['shipped-in'];
	if (!Array.isArray(list)) return 'missing';
	if (list.length === 0) return 'empty';
	const shas = list.filter(
		(v) => typeof v === 'string' && v.trim().length > 0,
	);
	if (shas.length === 0) return 'empty';
	if (!shas.every((v) => /^[0-9a-f]{7,40}$/.test((v as string).trim()))) {
		return 'invalid';
	}
	return 'ok';
};

/**
 * What to actually do next.
 *
 * This used to end with "(force:true if no peer reviewer is
 * available)", which taught every agent that read it to bypass the
 * peer-review gate the moment closing became inconvenient — and a
 * proposal closed that way looks identical to one that was reviewed.
 * The honest next step is the two-call handoff: the implementer opens
 * the round, a different agent approves it. If no reviewer is
 * available, the proposal is not closable yet, and saying so is the
 * point of the gate.
 */
const nextActionFor = (
	state: IReadyToCloseFinding['shippedInState'],
	proposalId: string,
): string => {
	switch (state) {
		case 'missing':
		case 'empty':
			return (
				`Add \`shipped-in: [<sha>]\` to the top-level frontmatter of ${proposalId} ` +
				`(between the two leading --- lines — NOT inside a resolution: block). ` +
				`Find the SHA with: \`git log --oneline --all | head -20 | grep -i ${proposalId.slice(0, 1)}0\`. ` +
				`Then open a review round and have a DIFFERENT agent approve it: ` +
				`proposals_proposal_review { action: "submit", proposalId: "${proposalId}", sliceId: "<finished-slice>", agent: "<implementer>" }, ` +
				`then proposals_proposal_review { action: "approve", ... , agent: "<reviewer ≠ implementer>" }. ` +
				`Finally proposals_proposal_transition { id: "${proposalId}", to: "done", reason: "all slices done; close-loop" }.`
			);
		case 'invalid':
			return (
				`The \`shipped-in:\` list of ${proposalId} contains entries that are not 7-40 char hex SHAs. ` +
				`Replace each entry with the real commit hash. Until the gate (guardShippedInPresent) accepts every entry, the proposal cannot move to done.`
			);
		default:
			return `frontmatter already valid; run proposals_proposal_transition { id: "${proposalId}", to: "done", reason: "all slices done" }.`;
	}
};

export const scanReadyToClose = (
	proposalsDirAbs: string,
	options: { readonly proposalId?: string } = {},
): readonly IReadyToCloseFinding[] => {
	const root = repoRoot();
	const findings: IReadyToCloseFinding[] = [];
	for (const dir of SCAN_DIRS) {
		const abs = join(proposalsDirAbs, dir);
		if (!existsSync(abs)) continue;
		const files: string[] = [];
		walkMarkdown(abs, files);
		for (const proposalAbs of files) {
			const rel = relative(root, proposalAbs).split('\\').join('/');
			const markdown = readFileSync(proposalAbs, 'utf8');
			const fm = readFrontmatter(markdown);
			const proposalId = typeof fm.id === 'string' ? fm.id : 'unknown';
			if (options.proposalId && proposalId !== options.proposalId) {
				continue;
			}
			const { done, total } = collectSliceStatuses(markdown);
			// Skip non-completed proposals.
			if (total === 0 || done < total) continue;
			const state = shippedInState(fm);
			findings.push({
				relPath: rel,
				proposalId,
				totalSlices: total,
				doneSlices: done,
				shippedInState: state,
				nextAction: nextActionFor(state, proposalId),
			});
		}
	}
	findings.sort((a, b) => a.proposalId.localeCompare(b.proposalId));
	return findings;
};

const render = (findings: readonly IReadyToCloseFinding[]): string => {
	if (findings.length === 0) {
		return '✓ proposal-ready-to-close: no proposal in in-progress/ is fully done but un-closed.\n';
	}
	const lines: string[] = [
		`✖ proposal-ready-to-close: ${findings.length} proposal(s) in in-progress/ have all slices done and are waiting on a close-loop call.\n`,
	];
	for (const f of findings) {
		lines.push(
			`  ${f.proposalId} (${f.doneSlices}/${f.totalSlices} slices done, shipped-in: ${f.shippedInState})`,
		);
		lines.push(`    ${f.relPath}`);
		lines.push(`    next: ${f.nextAction}`);
	}
	lines.push(
		`\n  Resolutions: add shipped-in:[<sha>] to frontmatter (NOT resolution:) then proposals_proposal_transition { id, to: "done", reason }.`,
	);
	return lines.join('\n');
};

const main = (): number => {
	const args = new Set(process.argv.slice(2));
	const strict = args.has('--strict');
	const proposalArg = [...args]
		.find((arg) => arg.startsWith('--proposal='))
		?.split('=')[1];
	const proposalsDirAbs = join(repoRoot(), 'docs', 'mcp-vertex', 'proposals');
	const findings = scanReadyToClose(proposalsDirAbs, {
		...(proposalArg !== undefined ? { proposalId: proposalArg } : {}),
	});
	process.stdout.write(`${render(findings)}\n`);
	if (strict && findings.length > 0) return 1;
	return 0;
};

if (import.meta.main) process.exit(main());
