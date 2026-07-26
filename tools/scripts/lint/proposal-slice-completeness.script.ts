#!/usr/bin/env bun

/**
 * proposal-slice-completeness.script.ts
 *
 * `bun run lint:proposal-slice-completeness` — blocks `bun run validate`
 * whenever any proposal marked `status: done` has:
 *   - a `### S<n>` slice whose `**Status**:` is anything other than `done`
 *   - a `### S<n>` slice whose `Files:` lists paths that no longer exist
 *     (e.g. after a forgotten revert that the agent never re-shipped).
 *
 * This is the user-facing companion to the in-process
 * `proposal-completeness.ts` service (which gates `proposal_transition`
 * at runtime). The lint catches **drift**: a proposal whose status was
 * flipped to `done` historically but whose body no longer matches the
 * workspace today.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { collectSliceStatuses } from '../../../plugins/proposals/src/lib/services/proposal-completeness';
import { repoRoot } from '../lib/monorepo-paths';

const PROPOSAL_KINDS = [
	'audits',
	'feats',
	'fixes',
	'chores',
	'docs',
	'refactors',
	'perfs',
	'tests',
	'plans',
	'resumes',
];

const frontmatter = (content: string): Record<string, string> => {
	const match = /^---\n([\s\S]+?)\n---/.exec(content);
	if (match === null) return {};
	const lines = match[1].split('\n');
	const out: Record<string, string> = {};
	for (const line of lines) {
		const colonIdx = line.indexOf(':');
		if (colonIdx < 0) continue;
		const key = line.slice(0, colonIdx).trim();
		const value = line.slice(colonIdx + 1).trim();
		if (key !== '') out[key] = value;
	}
	return out;
};

interface IIssue {
	readonly proposal: string;
	readonly kind: 'pending-slice' | 'missing-file';
	readonly detail: string;
}

const findIssues = (root: string): readonly IIssue[] => {
	const out: IIssue[] = [];
	const doneRoot = join(root, 'docs', 'mcp-vertex', 'proposals', 'done');
	for (const kind of PROPOSAL_KINDS) {
		const dir = join(doneRoot, kind);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			if (extname(f) !== '.md' || f === 'README.md') continue;
			const path = join(dir, f);
			const content = readFileSync(path, 'utf8');
			const fm = frontmatter(content);
			const status = (fm.status ?? '').toLowerCase();
			if (status !== 'done') continue;
			const slices = collectSliceStatuses(content);
			for (const slice of slices) {
				if (slice.status !== 'done') {
					out.push({
						proposal: f,
						kind: 'pending-slice',
						detail: `S${slice.id} status=${slice.status} title='${slice.title}'`,
					});
				}
				for (const file of slice.files) {
					if (!existsSync(file)) {
						out.push({
							proposal: f,
							kind: 'missing-file',
							detail: `S${slice.id} declares ${file} (not on disk)`,
						});
					}
				}
			}
		}
	}
	return out;
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const issues = findIssues(root);
	if (issues.length === 0) {
		console.log(
			'✓ proposal-slice-completeness: every done/ proposal is fully shipped',
		);
		return 0;
	}
	const grouped = new Map<string, IIssue[]>();
	for (const issue of issues) {
		const arr = grouped.get(issue.proposal) ?? [];
		arr.push(issue);
		grouped.set(issue.proposal, arr);
	}
	console.error(
		`✗ proposal-slice-completeness: ${issues.length} issue(s) across ${grouped.size} proposal(s)`,
	);
	for (const [proposal, items] of grouped) {
		console.error(`  ${proposal}:`);
		for (const item of items) {
			console.error(`    - [${item.kind}] ${item.detail}`);
		}
	}
	console.error('');
	console.error(
		'fix: each proposal with pending slices must be `git mv` to ready/ and re-opened;',
	);
	console.error(
		'     each proposal with missing declared files must either re-ship the file or',
	);
	console.error(
		'     amend the proposal body to reflect what actually shipped.',
	);
	return 1;
};

process.exit(await main());
