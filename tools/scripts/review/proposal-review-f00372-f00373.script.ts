#!/usr/bin/env bun
/**
 * Records peer-review approval for f00372/f00373 slice S1, using the
 * on-disk peer-review log path the transition CLI actually reads
 * (`.cache/delendai/proposals/peer-review.jsonl`).
 */
import { join } from 'node:path';
import { buildReviewRegistration } from '@delendai/proposals/lib/tools/authoring.tool';
import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring.tool';

const workspaceRoot = '/home/cartago/_projects/delendai';
const options: IAuthoringToolOptions = {
	namespacePrefix: 'proposals',
	workspaceRoot,
	proposalsDirAbs: join(workspaceRoot, 'docs/delendai/proposals'),
	indexPathAbs: join(workspaceRoot, '.cache/delendai/proposals/index.json'),
	lockPathAbs: join(workspaceRoot, '.cache/delendai/agents.lock.json'),
	peerReviewLogPathAbs: join(
		workspaceRoot,
		'.cache/delendai/proposals/peer-review.jsonl',
	),
	counterPathAbs: join(
		workspaceRoot,
		'.cache/delendai/proposals/proposal-id-counters.json',
	),
	layout: {
		proposalsDir: 'docs/delendai/proposals',
		proposalIndexFile: '.cache/delendai/proposals/index.json',
	},
	extraFolders: [],
	validationCommand: 'bun run validate',
};

const reg = buildReviewRegistration(options);
let handler:
	| ((args: unknown) => Promise<{ content: Array<{ text: string }> }>)
	| undefined;
const server = {
	registerTool: (_n: string, _s: unknown, fn: any) => {
		handler = fn;
	},
};
await reg.register(server as never);

const jobs = [
	{
		proposalId: 'f00372',
		sliceId: 'S1',
		evidence: {
			commitHash: '11d31317f',
			validateExitCode: 0,
			testsPassing: 15,
			testsTotal: 15,
		},
		note: 'sonnet-reviewer-12: read ADR 0016 and ADR 0017 (docs/delendai/adr/), confirmed 0017 (Accepted) documents the managed default superseding 0016 adaptive default, and confirmed decideSurfaceModeFromCapabilities/resolveInitialSurfaceMode in packages/core/src/lib/surface/decide-mode.ts implement that precedence. Ran bun test packages/core/tests/src/lib/surface/decide-mode.spec.ts: 15/15 pass.',
	},
	{
		proposalId: 'f00373',
		sliceId: 'S1',
		evidence: {
			commitHash: 'd98f3fd6e',
			validateExitCode: 0,
			testsPassing: 4,
			testsTotal: 4,
		},
		note: 'sonnet-reviewer-12: ran find plugins -maxdepth 2 -iname plugin.manifest.ts (56 hits, 100% coverage) and re-ran the enforcement gates myself: plugin-manifest.script.ts (0 errors), manifest-vs-package.script.ts (OK), manifest-vs-presets.script.ts (OK), capabilities-declared.script.ts (56 plugins, all declared).',
	},
];

for (const job of jobs) {
	console.log(`\n=== ${job.proposalId} ${job.sliceId} approve ===`);
	const result = await handler!({
		proposalId: job.proposalId,
		sliceId: job.sliceId,
		action: 'approve',
		agent: 'sonnet-reviewer-12',
		note: job.note,
		evidence: job.evidence,
	});
	console.log(result.content?.[0]?.text);
}
