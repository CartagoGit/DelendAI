#!/usr/bin/env bun
/**
 * proposal-files-exist.script.ts — ratchet lint: every backtick-quoted
 * path in a proposal's **Files**: line should exist on disk.
 *
 * Proposal docs freeze the record of a slice at closing time, but the
 * `Files:` list drifts from what actually shipped more often than it
 * should: writers copy the originally-planned file names and never go
 * back to correct them after a mid-build re-scope (a00057 found this in
 * f00097, f00112, f00113, f00116, r00009, t00002, x00102 and x00103 —
 * the same class of defect an independent peer review caught in f00118
 * before q00002 could close). Only `done/`, `review/` and
 * `in-progress/` are scanned — `ready/`/`paused/` describe future work
 * that legitimately doesn't exist yet.
 *
 * Ratchet, like types-in-contracts: a baseline records today's known
 * violations (real historical debt, some of it legitimate — files
 * later refactored away after a proposal closed, or a documented
 * `oldPath` → `newPath` rename note where only the old path is
 * backtick-quoted on its own line); only NEW violations in NEW or
 * newly-transitioned proposals fail the gate.
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-files-exist.script.ts            # check
 *   bun tools/scripts/lint/proposal-files-exist.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/proposal-files-exist.script.ts --report   # counts only
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SCAN_DIRS: readonly string[] = ['done', 'review', 'in-progress'];
const PROPOSALS_ROOT = 'docs/mcp-vertex/proposals';
const BASELINE_REL = 'tools/scripts/lint/proposal-files-exist.baseline.json';

const NON_PATH = new Set(['none', 'n/a', 'tbd']);

/** Matches a `**Files**:` list through its continuation lines, stopping
 * at the next bullet, blank line, or heading. */
const FILES_BLOCK_RE =
	/\*\*Files\*\*:\s*([\s\S]*?)(?=\n\s*-\s*\*\*|\n\n|\n#{2,3}\s|$)/g;

const extractPathCandidates = (block: string): string[] =>
	[...block.matchAll(/`([^`]+)`/g)]
		.map((m) => m[1] ?? '')
		.map((path) => path.trim())
		.filter((p) => {
			if (p.length < 4) return false;
			if (!p.includes('/')) return false;
			if (p.includes('*') || p.includes('<') || p.includes('{'))
				return false;
			if (NON_PATH.has(p.toLowerCase())) return false;
			return true;
		});

const stripLineRefs = (p: string): string => p.replace(/:[\d,\-–]+$/, '');

const walkMarkdown = (absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) walkMarkdown(abs, out);
		else if (entry.name.endsWith('.md')) out.push(abs);
	}
};

/**
 * Paths that only ever exist at runtime: the plugin cache/results tree.
 * They are gitignored by design, so their absence in a clean checkout is
 * correct, not drift.
 */
export const isRuntimeStatePath = (candidate: string): boolean =>
	candidate.startsWith('.cache/') || candidate.includes('/.cache/');

/** Returns `{ relProposalPath: [missingPath, ...] }` for proposals with dangling Files: refs. */
export const scanMissingFiles = (root: string): Record<string, string[]> => {
	const result: Record<string, string[]> = {};
	for (const dir of SCAN_DIRS) {
		const abs = join(root, PROPOSALS_ROOT, dir);
		if (!existsSync(abs)) continue;
		const files: string[] = [];
		walkMarkdown(abs, files);
		for (const proposalAbs of files) {
			const text = readFileSync(proposalAbs, 'utf8');
			const missing: string[] = [];
			for (const m of text.matchAll(FILES_BLOCK_RE)) {
				for (const p of extractPathCandidates(m[1] ?? '')) {
					if (p.startsWith(`${PROPOSALS_ROOT}/ready/`)) continue;
					// Runtime state under the cache dir is generated at
					// use time and is gitignored, so it exists on the
					// machine that ran the slice and never in a fresh
					// checkout. Asserting it made this lint pass locally
					// and fail in CI — the split that hides a break from
					// the only person who can fix it.
					if (isRuntimeStatePath(p)) continue;
					const base = stripLineRefs(p);
					if (!existsSync(join(root, base))) missing.push(p);
				}
			}
			if (missing.length > 0) {
				result[relative(root, proposalAbs).split('\\').join('/')] =
					missing;
			}
		}
	}
	return result;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const main = (): number => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));
	const current = scanMissingFiles(root);
	const currentCounts: Record<string, number> = {};
	for (const [rel, missing] of Object.entries(current))
		currentCounts[rel] = missing.length;

	if (args.has('--update')) {
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(currentCounts, null, '\t')}\n`,
			'utf8',
		);
		const total = Object.values(currentCounts).reduce((a, b) => a + b, 0);
		process.stderr.write(
			`proposal-files-exist: baseline updated — ${Object.keys(currentCounts).length} proposals, ${total} dangling refs.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, missing] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (missing.length > allowed) {
			regressions.push(
				`  ${rel}: ${missing.map((p) => `\`${p}\``).join(', ')}`,
			);
		}
	}

	const totalCur = Object.values(currentCounts).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		process.stderr.write(
			`proposal-files-exist: ${Object.keys(currentCounts).length} proposals / ${totalCur} dangling refs (baseline ${totalBase}).\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ proposal-files-exist: ${regressions.length} proposal(s) have Files: entries that don't exist on disk:\n${regressions.join('\n')}\n\n` +
				`  Fix the Files: list to name what actually shipped, not what was originally planned.\n` +
				`  If this is a documented oldPath → newPath rename note, run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline.\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ proposal-files-exist: no new dangling refs; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ proposal-files-exist: no new dangling Files: refs (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
