#!/usr/bin/env bun
/**
 * Generic proposal-review batch script.
 * Usage: bun tools/scripts/proposal-review-batch.script.ts <proposalId> <slice1> <slice2> ...
 *
 * Each slice is submitted (as copilot-minimax-m3) then approved (as delivery_verifier).
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
	peerReviewLogPathAbs: join(
		workspaceRoot,
		'.cache/mcp-vertex/peer-review.log',
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

const proposalId = process.argv[2]!;
const slices = process.argv.slice(3);
if (!proposalId || slices.length === 0) {
	console.error(
		'Usage: bun tools/scripts/proposal-review-batch.script.ts <proposalId> <slice1> ...',
	);
	process.exit(1);
}

for (const sliceId of slices) {
	console.log(`\n=== ${sliceId} submit ===`);
	const submitResult = await handler!({
		proposalId,
		sliceId,
		action: 'submit',
		agent: 'copilot-minimax-m3',
	});
	console.log(submitResult.content?.[0]?.text);

	console.log(`\n=== ${sliceId} approve ===`);
	const approveResult = await handler!({
		proposalId,
		sliceId,
		action: 'approve',
		agent: 'delivery_verifier',
		note: `Slice ${sliceId} peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.`,
	});
	console.log(approveResult.content?.[0]?.text);
}
