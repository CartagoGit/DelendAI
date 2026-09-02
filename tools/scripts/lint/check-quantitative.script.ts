#!/usr/bin/env bun
/**
 * check-quantitative.script.ts — c00140 (Track H of q00006).
 *
 * Drift check that complements `tools/scripts/gen/quantitative.script.ts`.
 * For every doc registered in the quantitative `DEFAULT_DOCS` map, this
 * script reads the file as it stands on disk, regenerates the embedded
 * `<!-- mcp-vertex:begin quantitative -->` block from the live repo,
 * and fails if the on-disk block differs from the regenerated one.
 *
 * Designed for CI: every host that wants a fresh doc tree should first
 * run the generator (`bun tools/scripts/gen/quantitative.script.ts`),
 * then the drift check (`bun run check:quantitative`). Drift here
 * means the generator was skipped or the script silently broke.
 *
 * This is the drift check for a GENERATED block per
 * `docs/mcp-vertex/DOCS-MANUAL-VS-GENERATED.md` (d00011, rule #6).
 *
 * Privacy: the script enumerates registered docs only and never
 * surfaces host paths, secrets, or tool ids.
 *
 * Exit codes:
 *   0 — every registered doc is in sync with the live snapshot.
 *   1 — at least one doc drifted; see `formatReport`.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	buildSnapshot,
	updateDocBlock,
	type IQuantitativeSnapshot,
} from '../gen/quantitative.script';

const REPO_ROOT = process.cwd();

/**
 * Paths the generator embeds a quantitative-facts block into. The
 * generator's `updateDocs` is similarly conservative: it appends a
 * block to docs that exist today; the `overview.md` slot is a P2
 * placeholder for a future web page (`apps/web/src/data/pages/` does
 * not currently carry one).
 */
export const DEFAULT_DOCS = ['docs/mcp-vertex/AGENT-BOOTSTRAP.md'] as const;

export interface IQuantitativeDrift {
	readonly relPath: string;
	readonly onDiskLen: number;
	readonly refreshedLen: number;
	readonly diffLines: readonly string[];
}

/**
 * Lines whose value changes without any code change, normalized on BOTH
 * sides before the equality check.
 *
 * `Generated at:` was always volatile by design. `Proposals:` is the
 * dangerous one: it moves every time a proposal changes status, which is
 * exactly the operation this gate guards. Because `check:quantitative`
 * runs inside `bun run validate`, and a passing `validate` is the
 * evidence `close_slice` / `proposal_transition` demand, counting
 * proposals here made closing a proposal invalidate the gate that lets
 * you close a proposal — a deadlock that stranded 128 fully-implemented
 * proposals in `ready/`.
 *
 * The generator still writes the real counts (the block carries a
 * `Generated at:` stamp and is a snapshot, not a live view); the drift
 * check just stops treating a moved count as a broken generator.
 */
const VOLATILE_LINES: readonly (readonly [RegExp, string])[] = [
	[/(Generated at: )[^\n]+/, '$1<<snapshot>>'],
	[/(Proposals: )[^\n]+/, '$1<<snapshot>>'],
];

const normalizeVolatile = (text: string): string =>
	VOLATILE_LINES.reduce(
		(acc, [pattern, replacement]) => acc.replace(pattern, replacement),
		text,
	);

const MARKER_BEGIN = '<!-- mcp-vertex:begin quantitative -->';
const MARKER_END = '<!-- mcp-vertex:end quantitative -->';

const renderBlockForCompare = (snap: IQuantitativeSnapshot): string => {
	// Reproduce the generator's block layout in-memory so the drift
	// check is independent of any on-disk artefact (it runs before
	// the generator's writes land in CI).
	const snapshotFormat = (s: IQuantitativeSnapshot): string =>
		[
			`Generated at: ${s.generatedAt}`,
			'',
			`Plugins: ${s.plugins.total}`,
			`Tools: ${s.tools.total}`,
			`Test specs: ${s.tests.specFiles} (≈${s.tests.testCases} cases)`,
			`Workspaces: ${s.packages.packages} packages, ${s.packages.apps} apps, ${s.packages.extensions} extensions, ${s.packages.tools} tooling workspace(s).`,
			`Proposals: ${s.proposals.total} on disk (${
				s.proposals.byStatus
					.map((b) => `${b.kind}=${b.count}`)
					.join(', ') || 'none'
			})`,
		].join('\n');

	return [MARKER_BEGIN, '```', snapshotFormat(snap), '```', MARKER_END].join(
		'\n',
	);
};

const findFirstDiff = (a: string, b: string): number => {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i += 1) {
		if (a[i] !== b[i]) return i;
	}
	return len;
};

/**
 * Compare an on-disk doc against the live snapshot.  Returns null
 * if the doc is in sync, or a populated drift record otherwise.
 *
 * Catches three classes of drift:
 *   - Missing block (the generator would append a §Quantitative
 *     facts section; the on-disk file has none).
 *   - Stale block (the block was committed before the most recent
 *     snapshot regeneration).
 *   - Manual edits inside the block (a human edited the block).
 */
export const diffDoc = (
	docText: string,
	snap: IQuantitativeSnapshot,
): IQuantitativeDrift | null => {
	const diskHasBlock = docText.includes(MARKER_BEGIN);
	if (!diskHasBlock) {
		// Normalize timestamp before comparing what would be appended.
		const normalizedSnap: IQuantitativeSnapshot = {
			...snap,
			generatedAt: '<<snapshot>>',
		};
		const { text: refreshed } = updateDocBlock(docText, normalizedSnap);
		const appendLen = refreshed.length - docText.trimEnd().length;
		return {
			relPath: '',
			onDiskLen: docText.length,
			refreshedLen: refreshed.length,
			diffLines: [
				'block is missing; generator would append a §Quantitative facts section.',
				`+${appendLen} bytes appended.`,
			],
		};
	}
	// Normalize every volatile line (see VOLATILE_LINES) on both sides so
	// a fresh `now()` or a proposal that merely changed status does not
	// register as generator drift.
	const normalizedDoc = normalizeVolatile(docText);
	const normalizedSnap: IQuantitativeSnapshot = {
		...snap,
		generatedAt: '<<snapshot>>',
	};
	const { text: refreshed } = updateDocBlock(normalizedDoc, normalizedSnap);
	if (normalizeVolatile(refreshed) === normalizedDoc) return null;
	const startIdx = docText.indexOf(MARKER_BEGIN);
	const endIdx = docText.indexOf(MARKER_END) + MARKER_END.length;
	const diskBlock = normalizeVolatile(docText.slice(startIdx, endIdx));
	const expectedBlock = normalizeVolatile(
		renderBlockForCompare(normalizedSnap),
	);
	return {
		relPath: '',
		onDiskLen: diskBlock.length,
		refreshedLen: expectedBlock.length,
		diffLines: [
			`on-disk block length: ${diskBlock.length} bytes`,
			`generator block length: ${expectedBlock.length} bytes`,
			`first divergence at index ${findFirstDiff(diskBlock, expectedBlock)}`,
		],
	};
};

export const detectQuantitativeDrift = async (): Promise<
	readonly IQuantitativeDrift[]
> => {
	const snap = await buildSnapshot();
	const drifts: IQuantitativeDrift[] = [];
	for (const relPath of DEFAULT_DOCS) {
		const abs = join(REPO_ROOT, relPath);
		const text = await readFile(abs, 'utf8').catch(() => '');
		if (text.length === 0) continue;
		const drift = diffDoc(text, snap);
		if (drift !== null) {
			drifts.push({ ...drift, relPath });
		}
	}
	return drifts;
};

export const formatReport = (drifts: readonly IQuantitativeDrift[]): string => {
	if (drifts.length === 0) {
		return 'check-quantitative: 0 drift(s) across all registered docs.\n';
	}
	const lines: string[] = [
		`check-quantitative: ${drifts.length} drift(s) detected.`,
		'',
		'  Run `bun tools/scripts/gen/quantitative.script.ts` to refresh.',
		'',
	];
	for (const drift of drifts) {
		lines.push(`  ${drift.relPath}`);
		for (const line of drift.diffLines) lines.push(`    ${line}`);
	}
	return `${lines.join('\n')}\n`;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	void argv;
	const drifts = await detectQuantitativeDrift();
	process.stdout.write(formatReport(drifts));
	return drifts.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
