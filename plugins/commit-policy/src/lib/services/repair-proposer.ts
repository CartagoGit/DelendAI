/**
 * repair-proposer.ts — x00419 S5.
 *
 * Given a StormDetector snapshot with one or more storms that
 * crossed the threshold, produce a `kind: repair` proposal under
 * `docs/delendai/proposals/ready/repairs/`. The proposal is
 * single-purpose: its `Files:` are the union of slice files
 * across the storm's `sampleProposalIds`, intersected with the
 * storm's `suggestedFix` hint (which usually points to a single
 * source file).
 *
 * The host boot step (S5 wiring) calls this once on each plugin
 * load. It is idempotent: a proposal with the same `<trigger>/
 * <code>/<date>` slug is not re-created.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { IStorm } from './storm-detector';

import type {
	IRepairProposalResult,
	IRepairProposerOptions,
} from '../contracts/interfaces/repair-proposer.interface';

export type {
	IRepairProposalResult,
	IRepairProposerOptions,
} from '../contracts/interfaces/repair-proposer.interface';

const safeName = (s: string): string =>
	s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

const dateSlug = (d: Date): string => {
	const y = d.getUTCFullYear();
	const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
	const day = `${d.getUTCDate()}`.padStart(2, '0');
	return `${y}${m}${day}`;
};

/**
 * Extract the source-file hint from a `suggestedFix` line of the
 * form "<filename>: <rest>". Conservative: if no `:` is present,
 * returns undefined so the proposal falls back to no `Files:`
 * constraint and lets the resolver surface a WARN.
 */
export const inferSourceFile = (
	hint: string | undefined,
): string | undefined => {
	if (hint === undefined) return undefined;
	const colon = hint.indexOf(':');
	if (colon <= 0) return undefined;
	const candidate = hint.slice(0, colon).trim();
	if (
		candidate.length === 0 ||
		candidate.includes(' ') ||
		candidate.startsWith('(')
	) {
		return undefined;
	}
	if (candidate.endsWith('.ts') || candidate.endsWith('.json')) {
		return candidate;
	}
	return undefined;
};

export const buildRepairProposalFilename = (
	storm: IStorm,
	now: Date,
): string => {
	const id = `auto-${safeName(storm.code)}-${dateSlug(now)}-${storm.firstSeenAt
		.toString(36)
		.slice(-6)}`;
	return join('repairs', `x${id}-auto-repair-${safeName(storm.code)}.md`);
};

const buildBody = (storm: IStorm, sourceFile: string | undefined): string => {
	const lines: string[] = [
		'---',
		'id: auto',
		'kind: repair',
		'title: >',
		`  Auto-repair for repeated ${storm.code} (x00419)`,
		'status: ready',
		'author: x00419-auto-repair',
		`created: ${new Date(storm.firstSeenAt).toISOString()}`,
		'priority: P1',
		'auto_generated: true',
		'storm:',
		`  code: ${storm.code}`,
		`  trigger: ${storm.trigger}`,
		`  count: ${storm.count}`,
		`  windowSeconds: ${storm.windowSeconds}`,
		`  firstSeenAt: ${new Date(storm.firstSeenAt).toISOString()}`,
		`  lastSeenAt: ${new Date(storm.lastSeenAt).toISOString()}`,
		...(storm.suggestedFix !== undefined
			? [`  suggestedFix: ${storm.suggestedFix.replace(/\n/g, ' ')}`]
			: []),
		'slices:',
		'  - id: S1',
		`    title: Fix ${storm.code} (auto-generated repair proposal)`,
		'---',
		'',
		`# Auto-repair for repeated ${storm.code}`,
		'',
		`The \`${storm.trigger}\` trigger produced \`${storm.code}\` ${storm.count} times in a ${storm.windowSeconds}s sliding window. The repair proposal is filed automatically by the host boot hook (x00419 S5).`,
		'',
		'## Sample proposal IDs implicated',
		'',
		...storm.sampleProposalIds.map((id) => `- ${id}`),
		'',
	];
	if (storm.suggestedFix !== undefined) {
		lines.push('## Suggested fix');
		lines.push('');
		lines.push('```');
		lines.push(storm.suggestedFix);
		lines.push('```');
		lines.push('');
	}
	if (sourceFile !== undefined) {
		lines.push('## Files');
		lines.push('');
		lines.push(`- ${sourceFile}`);
		lines.push('');
	}
	return lines.join('\n');
};

/**
 * For each storm where `exceedsThreshold === true` AND
 * `sampleProposalIds.length >= 1`, file a repair proposal under
 * `<docsDir>/proposals/ready/repairs/`. Returns one result per
 * storm in the snapshot.
 */
export const fileRepairProposals = (
	storms: readonly IStorm[],
	options: IRepairProposerOptions,
): readonly IRepairProposalResult[] => {
	const now = options.now ?? new Date();
	const repairsDir = join(options.docsDir, 'proposals', 'ready', 'repairs');
	const results: IRepairProposalResult[] = [];

	for (const storm of storms) {
		if (!storm.exceedsThreshold || storm.sampleProposalIds.length < 1) {
			results.push({
				storm,
				filePath: '',
				proposed: false,
				reason: storm.exceedsThreshold
					? 'sampleProposalIds < 1'
					: 'count < threshold',
			});
			continue;
		}
		const sourceFile = inferSourceFile(storm.suggestedFix);
		const filename = buildRepairProposalFilename(storm, now);
		const fullPath = join(options.docsDir, 'proposals', 'ready', filename);
		try {
			mkdirSync(repairsDir, { recursive: true });
			// `wx` is the idempotency check AND the write in one atomic
			// syscall. The previous `existsSync` guard followed by a plain
			// write was a check-then-act race, and this repo runs several
			// agents against one worktree: two of them observing "does not
			// exist" for the same storm both proceeded, and the second
			// silently overwrote the first proposal. EEXIST is the answer
			// to "already exists", reported below rather than thrown.
			writeFileSync(fullPath, buildBody(storm, sourceFile), {
				encoding: 'utf8',
				flag: 'wx',
			});
			results.push({
				storm,
				filePath: filename,
				proposed: true,
				reason: 'created',
			});
		} catch (error: unknown) {
			// EEXIST is not a failure: it is the atomic answer to the
			// question the old `existsSync` asked, and the caller
			// distinguishes "already filed" from "could not file".
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				results.push({
					storm,
					filePath: filename,
					proposed: false,
					reason: 'already exists',
				});
				continue;
			}
			results.push({
				storm,
				filePath: filename,
				proposed: false,
				reason: `write failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			});
		}
	}
	return results;
};
