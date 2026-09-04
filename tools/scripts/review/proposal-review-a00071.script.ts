#!/usr/bin/env bun
import { join } from 'node:path';
import { buildReviewRegistration } from '@delendai/proposals/lib/tools/authoring.tool';
import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring.tool';

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

console.log('=== submit (as implementer copilot-grok-4.5) ===');
console.log(
	(
		await handler!({
			proposalId: 'a00071',
			sliceId: 'S1',
			action: 'submit',
			agent: 'copilot-grok-4.5',
		})
	).content?.[0]?.text,
);

console.log('\n=== approve (as reviewer copilot-minimax-m3) ===');
console.log(
	(
		await handler!({
			proposalId: 'a00071',
			sliceId: 'S1',
			action: 'approve',
			agent: 'copilot-minimax-m3',
			note: 'Independent LLM audit (Scope A code-reading) complete; trust-boundaries + concurrency findings backed by live file:line evidence; complements the external GitHub-API intake (a00070).',
		})
	).content?.[0]?.text,
);
