#!/usr/bin/env bun
/**
 * Independent-reviewer approve for f00372/f00373 S1.
 *
 * Both proposals already have a `submit` entry in
 * `.cache/mcp-vertex/proposals/peer-review.jsonl` (from a prior agent
 * session: sonnet-verifier-9 / verifier-independent), so the
 * transition-proposal CLI's peer-review gate reads that log — not the
 * markdown fallback — and needs an `approved` verdict from a DIFFERENT
 * agent before `review -> done` is allowed. This records that approval
 * as `sonnet-reviewer-12`, the independent reviewer for this pass, with
 * real evidence gathered by actually running the gates named in each
 * proposal's "Independently verified" note.
 */
import { join } from 'node:path';
import { buildReviewRegistration } from '@mcp-vertex/proposals/lib/tools/authoring.tool';
import type { IAuthoringToolOptions } from '@mcp-vertex/proposals/lib/tools/authoring.tool';

const workspaceRoot = '/home/cartago/_projects/mcp-vertex';
const options: IAuthoringToolOptions = {
	namespacePrefix: 'proposals',
	workspaceRoot,
	proposalsDirAbs: join(workspaceRoot, 'docs/mcp-vertex/proposals'),
	indexPathAbs: join(workspaceRoot, '.cache/mcp-vertex/proposals/index.json'),
	lockPathAbs: join(workspaceRoot, '.cache/mcp-vertex/agents.lock.json'),
	// NOTE: this is the SAME path `buildSwarmPaths`/the transition CLI use
	// (`.cache/mcp-vertex/proposals/peer-review.jsonl`) — the older
	// per-proposal scripts in this directory point at a stale
	// `.cache/mcp-vertex/peer-review.log` that the real gate never reads.
	peerReviewLogPathAbs: join(
		workspaceRoot,
		'.cache/mcp-vertex/proposals/peer-review.jsonl',
	),
	counterPathAbs: join(
		workspaceRoot,
		'.cache/mcp-vertex/proposals/proposal-id-counters.json',
	),
	layout: {
		proposalsDir: 'docs/mcp-vertex/proposals',
		proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
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
		note: 'sonnet-reviewer-12: read ADR 0016 and ADR 0017 (docs/mcp-vertex/adr/), confirmed 0017 (Accepted) documents the managed default superseding 0016 adaptive default, and confirmed decideSurfaceModeFromCapabilities/resolveInitialSurfaceMode in packages/core/src/lib/surface/decide-mode.ts implement that precedence. Ran `bun test packages/core/tests/src/lib/surface/decide-mode.spec.ts`: 15/15 pass.',
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
		note: 'sonnet-reviewer-12: ran `find plugins -maxdepth 2 -iname plugin.manifest.ts` (56 hits, 100% coverage) and re-ran the enforcement gates myself: plugin-manifest.script.ts (0 errors), manifest-vs-package.script.ts (OK), manifest-vs-presets.script.ts (OK), capabilities-declared.script.ts (56 plugins, all declared).',
	},
];

for (const job of jobs) {
	console.log(
		`\n=== ${job.proposalId} ${job.sliceId} approve (as sonnet-reviewer-12) ===`,
	);
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
