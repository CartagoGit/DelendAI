#!/usr/bin/env bun
/**
 * bootstrap-canonical.script.ts — f00083 S2.
 *
 * Enforce the "single source of truth" contract for the universal agent
 * bootstrap (`docs/mcp-vertex/AGENT-BOOTSTRAP.md`):
 *
 *   1. The preamble anchor string MUST be present
 *      ("This file is the only place agent rules live."). The anchor
 *      is the load-bearing sentence that tells every host "point here,
 *      do not inline". If a peer agent deletes it, hosts lose their
 *      reason to delegate.
 *
 *   2. The H2 sections MUST appear in the canonical order
 *      (Table of contents → 1 Orient → 2 Route → 3 Prompt → 4 Loop →
 *      5 DoD → 6 Invariants → 7 Repo rules → 8 Host appendices).
 *      A peer agent that reorders the sections silently renumbers the
 *      host-appendix anchors and breaks the table of contents.
 *
 *   3. No `## ` heading is duplicated. A duplicate H2 collapses the
 *      table of contents and the per-host appendix links.
 *
 *   4. Any failure outputs a per-file `BLOCKING` list with the line
 *      number and a next-action ("do not edit the section order; update
 *      the slice spec first and let the lint change with it").
 *
 * Usage:
 *   bun tools/scripts/lint/bootstrap-canonical.script.ts
 *   bun tools/scripts/lint/bootstrap-canonical.script.ts --check
 *
 * Exit codes:
 *   0 — bootstrap is canonical
 *   1 — one or more rules violated
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Canonical location of the universal agent bootstrap. */
export const BOOTSTRAP_PATH = 'docs/mcp-vertex/AGENT-BOOTSTRAP.md';

/**
 * Anchor string. The first sentence of the preamble that makes the
 * file's role explicit: it is the only place agent rules live. If a
 * peer agent removes it, hosts lose the load-bearing reason to
 * delegate to this file.
 */
export const ANCHOR = 'This file is the only place agent rules live';

/**
 * Canonical H2 ordering. Every H2 in the bootstrap MUST appear in
 * this order. The headings are matched verbatim (no fuzzy match) so a
 * reworded heading is treated as a violation — that is intentional:
 * the appendix anchors in the table of contents are case-sensitive.
 */
export const CANONICAL_SECTIONS: readonly string[] = [
	'## Table of contents',
	'## 1. Orient first — one cheap call',
	'## 2. Route work — ask the server',
	'## 3. Bootstrap prompt — insert when the host supports it',
	'## 4. Workflow loop',
	'## 5. Definition of done',
	'## 6. Invariants you must not break',
	'## 7. Repo-level rules (only when the host reads `AGENTS.md`)',
	'## 8. Host appendices',
];

/** What a violation looks like. */
export interface IBootstrapViolation {
	readonly kind:
		| 'missing-anchor'
		| 'missing-section'
		| 'out-of-order'
		| 'duplicate-section';
	readonly message: string;
	readonly line?: number;
	readonly nextAction: string;
}

/** What `lintBootstrap` returns. */
export interface IBootstrapLintResult {
	readonly file: string;
	readonly violations: readonly IBootstrapViolation[];
	readonly headingCount: number;
}

/**
 * Pure lint function: given the raw bootstrap text, return any
 * violations. Exported for hermetic testing.
 */
export const lintBootstrap = (
	content: string,
	options: { file?: string; anchor?: string; canonical?: readonly string[] } = {}
): IBootstrapLintResult => {
	const file = options.file ?? '<inline>';
	const anchor = options.anchor ?? ANCHOR;
	const canonical = options.canonical ?? CANONICAL_SECTIONS;
	const violations: IBootstrapViolation[] = [];

	// Rule 1 — anchor string.
	if (!content.includes(anchor)) {
		violations.push({
			kind: 'missing-anchor',
			message: `bootstrap preamble is missing the canonical anchor: ${JSON.stringify(anchor)}`,
			nextAction:
				'Restore the anchor sentence at the top of the bootstrap (it is the load-bearing reason every host delegates here).',
		});
	}

	// Walk H2 lines, recording their order.
	const h2Regex = /^## .+$/gm;
	const h2Hits: Array<{ heading: string; line: number }> = [];
	for (;;) {
		const m = h2Regex.exec(content);
		if (m === null) break;
		const heading = m[0];
		// Defensive: `m[0]` for the `^## .+$` pattern always has length > 0
		// when the regex matches; the cast keeps noUncheckedIndexedAccess
		// happy without an `as` escape hatch.
		const line = m.index >= 0 ? lineOf(content, m.index) : 0;
		h2Hits.push({ heading, line });
	}

	// Rule 3 — no duplicate H2.
	const seen = new Map<string, number>();
	for (const { heading, line } of h2Hits) {
		const prior = seen.get(heading);
		if (prior !== undefined) {
			violations.push({
				kind: 'duplicate-section',
				message: `duplicate H2 heading ${JSON.stringify(heading)} (first at line ${prior}, again at line ${line})`,
				line,
				nextAction:
					'Remove the duplicate H2; if a new section is needed, append it to the CANONICAL_SECTIONS list in the lint first.',
			});
		} else {
			seen.set(heading, line);
		}
	}

	// Rule 2 — canonical order. We only consider headings that are in
	// the canonical list. Headings not in the list (e.g. `## Appendix A.1`)
	// are allowed between canonical entries without breaking the order.
	let canonicalCursor = 0;
	for (const { heading, line } of h2Hits) {
		if (canonicalCursor >= canonical.length) {
			// All canonical sections already matched; remaining H2s are
			// sub-appendices inside §8 (e.g. `## 8.1 ...`). Skip.
			continue;
		}
		if (heading === canonical[canonicalCursor]) {
			canonicalCursor += 1;
		} else if (canonical.includes(heading)) {
			// This heading IS canonical, but the order is wrong.
			const expected = canonical[canonicalCursor];
			const expectedIdx = canonicalCursor;
			violations.push({
				kind: 'out-of-order',
				message: `H2 ${JSON.stringify(heading)} appears at line ${line} but the canonical order expects ${JSON.stringify(expected)} (canonical index ${expectedIdx}) at this position`,
				line,
				nextAction:
					'Do not edit the section order. If a reordering is intentional, update CANONICAL_SECTIONS in the lint first and run `bun run lint:bootstrap-canonical` to verify.',
			});
			// Fast-forward: skip past this canonical heading so we do
			// not re-report it on every later match.
			canonicalCursor = canonical.indexOf(heading) + 1;
		}
		// Unknown H2s (not in canonical, not in our list) are ignored.
	}

	// Catch any canonical sections that never appeared.
	for (let i = canonicalCursor; i < canonical.length; i += 1) {
		const missing = canonical[i] ?? '';
		violations.push({
			kind: 'missing-section',
			message: `bootstrap is missing canonical H2 ${JSON.stringify(missing)} (expected at canonical index ${i})`,
			nextAction:
				'Restore the missing H2 verbatim. The lint is the contract — edit the slice spec, not the bootstrap, before adding new sections.',
		});
	}

	return {
		file,
		violations,
		headingCount: h2Hits.length,
	};
};

/**
 * 1-based line number for a character index in `content`.
 * Used to give actionable line numbers in violation messages.
 */
const lineOf = (content: string, charIndex: number): number => {
	let line = 1;
	for (let i = 0; i < charIndex && i < content.length; i += 1) {
		if (content.charCodeAt(i) === 10 /* \n */) {
			line += 1;
		}
	}
	return line;
};

/**
 * Read the bootstrap from disk and lint it. Convenience wrapper used
 * by the CLI entry point and by the spec.
 */
export const lintBootstrapFromDisk = (filePath: string): IBootstrapLintResult => {
	const content = readFileSync(filePath, 'utf8');
	return lintBootstrap(content, { file: filePath });
};

/**
 * Walk the three host files relative to `workspaceRoot` and return a
 * list of results. Returns an empty list (not an error) when the
 * bootstrap does not exist on disk — let the caller decide.
 */
export const lintBootstrapForWorkspace = (
	workspaceRoot: string
): readonly IBootstrapLintResult[] => {
	const absPath = resolve(workspaceRoot, BOOTSTRAP_PATH);
	if (!existsSync(absPath)) {
		return [
			{
				file: absPath,
				violations: [
					{
						kind: 'missing-anchor',
						message: `bootstrap file does not exist at ${absPath}`,
						nextAction: `Restore ${BOOTSTRAP_PATH} — every host file points at it; deleting it breaks the contract.`,
					},
				],
				headingCount: 0,
			},
		];
	}
	return [lintBootstrapFromDisk(absPath)];
};

/**
 * CLI entry point. Pretty-prints violations and exits 0 / 1.
 *
 * Usage:
 *   bun tools/scripts/lint/bootstrap-canonical.script.ts
 *   bun tools/scripts/lint/bootstrap-canonical.script.ts --check
 */
const main = (): number => {
	const args = new Set(process.argv.slice(2));
	const isCheck = args.has('--check');
	const workspaceRoot = process.cwd();

	const results = lintBootstrapForWorkspace(workspaceRoot);
	const allViolations = results.flatMap((r) =>
		r.violations.map((v) => ({ ...v, file: r.file }))
	);

	if (allViolations.length === 0) {
		const headingSummary = results
			.map((r) => `${pathBasename(r.file)}: ${r.headingCount} H2 sections`)
			.join(', ');
		console.log(`✓ bootstrap-canonical: ${headingSummary}; all canonical.`);
		return 0;
	}

	console.error('bootstrap-canonical: BLOCKING violations:');
	for (const v of allViolations) {
		const loc = v.line !== undefined ? `:${v.line}` : '';
		console.error(`  ${v.file}${loc}  [${v.kind}]  ${v.message}`);
		console.error(`    next-action: ${v.nextAction}`);
	}
	console.error(
		`\nbootstrap-canonical: ${allViolations.length} violation(s) across ${results.length} file(s).`
	);
	return isCheck ? 0 : 1;
};

const pathBasename = (p: string): string => {
	const parts = p.split('/');
	return parts[parts.length - 1] ?? p;
};

// Run when invoked directly (not when imported by a spec).
if (import.meta.main) {
	process.exit(main());
}
