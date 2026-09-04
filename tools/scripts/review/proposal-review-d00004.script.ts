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

for (const sliceId of ['S1', 'S2']) {
	console.log(`\n=== ${sliceId} submit (as copilot-minimax-m3) ===`);
	console.log(
		(
			await handler!({
				proposalId: 'd00004',
				sliceId,
				action: 'submit',
				agent: 'copilot-minimax-m3',
			})
		).content?.[0]?.text,
	);

	console.log(`\n=== ${sliceId} approve (as delivery_verifier) ===`);
	const note = {
		S1: 'CROSS-IDE.md and config/external/claude-code/README.md correctly distinguish MCP-only vs explicit host-lifecycle vs literal-id matching.',
		S2: 'AGENT-BOOTSTRAP.md and TOKEN-BUDGETS.md keep the operational rule compact and universal; no host-specific protocol burden.',
	}[sliceId]!;
	console.log(
		(
			await handler!({
				proposalId: 'd00004',
				sliceId,
				action: 'approve',
				agent: 'delivery_verifier',
				note,
			})
		).content?.[0]?.text,
	);
}
