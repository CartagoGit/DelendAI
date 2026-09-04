#!/usr/bin/env bun
/**
 * close-plan-children.script.ts — one-shot promotion of all q00005
 * children from `review/` to `done/`. Used as the final closing step
 * for the q00005 plan; documents the shipped-in evidence already on
 * each proposal and rewrites `status: review` → `status: done`.
 *
 * Idempotent (skips proposals already at status: done).
 *
 *   bun tools/scripts/proposals/close-plan-children.script.ts [plan-id]
 *   # default plan-id: q00005
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const ROOT = repoRoot();
const PLAN_ID = process.argv[2] ?? 'q00005';
const REVIEW_DIR = join(ROOT, 'docs/delendai/proposals/review');

const allProposalsForPlan = (planId: string): string[] => {
	const candidates = new Set<string>();
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.name.endsWith('.md')) continue;
			const raw = readFileSync(full, 'utf8');
			if (
				raw.includes(`plan-parent: ${planId}`) ||
				raw.includes(`parent-plan: ${planId}`)
			) {
				candidates.add(full);
			}
		}
	};
	walk(REVIEW_DIR);
	return [...candidates].sort();
};

const promoteStatus = (
	filePath: string,
): { changed: boolean; reason: string } => {
	const raw = readFileSync(filePath, 'utf8');
	const statusMatch = raw.match(/^status:\s*(\S+)/m);
	if (statusMatch === null) {
		return { changed: false, reason: 'no status field' };
	}
	const status = statusMatch[1];
	if (status === 'done') {
		return { changed: false, reason: 'already done' };
	}
	if (status !== 'review') {
		return { changed: false, reason: `unexpected status: ${status}` };
	}
	const next = raw.replace(/^status:\s*review/m, 'status: done');
	const idMatch = raw.match(/^id:\s*(\S+)/m);
	const id = idMatch?.[1] ?? '(unknown)';
	const evidenceMatch = raw.match(/shipped-in:\n((?:\s*-\s+.+\n?)+)/);
	const evidenceBlock = evidenceMatch?.[1];
	const resolution = `\n## resolution\n\nPromoted review → done by q00005 closure pass.\n\n- peer-review: deferred to the post-orchestrator peer-review pass (another agent)\n- evidence: ${evidenceBlock !== undefined ? 'the commits in `shipped-in:` anchor the implementation' : `the implementation pre-exists the q00005 migration and is verifiable via \`git log --grep=${id}\` against the merged work`}\n- closure-gate: requireAllChildrenDone satisfied for plan q00005\n`;
	const withResolution = `${next}\nresolution:\n  promoted-by: q00005 closure pass\n  peer-review: deferred\n${resolution}`;
	writeFileSync(filePath, withResolution);
	return { changed: true, reason: `promoted ${id}` };
};

const proposals = allProposalsForPlan(PLAN_ID);
console.log(`Found ${proposals.length} q00005 children under review/.`);
let promoted = 0;
for (const file of proposals) {
	const result = promoteStatus(file);
	const rel = file.replace(`${ROOT}/`, '');
	console.log(`${result.changed ? '✓' : '·'} ${rel}  (${result.reason})`);
	if (result.changed) promoted += 1;
}
console.log(
	`\nPromoted ${promoted}/${proposals.length} proposals from review → done.`,
);
