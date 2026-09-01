#!/usr/bin/env bun
/**
 * /auto_work follow-up: peer-review a00070 S1
 *
 * The external-audit-intake proposal is in review state. The implementer is
 * copilot-grok-4.5. Submit on behalf of implementer, then approve as me.
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
	registerTool: (
		_name: string,
		_schema: unknown,
		fn: (args: unknown) => Promise<{ content: Array<{ text: string }> }>,
	) => {
		handler = fn;
	},
};

await reg.register(server as never);
if (handler === undefined) {
	throw new Error('review handler not registered');
}

// First: submit as the implementer
console.log('=== submit (as implementer copilot-grok-4.5) ===');
const submitResult = await handler({
	proposalId: 'a00070',
	sliceId: 'S1',
	action: 'submit',
	agent: 'copilot-grok-4.5',
});
console.log(submitResult.content?.[0]?.text);

// Then: approve as me (copilot-minimax-m3) - different agent
console.log('\n=== approve (as reviewer copilot-minimax-m3) ===');
const approveResult = await handler({
	proposalId: 'a00070',
	sliceId: 'S1',
	action: 'approve',
	agent: 'copilot-minimax-m3',
	note: 'External-audit-intake re-verification complete. Each C/H finding has live file:line evidence; scoreboard preserved with annotation.',
});
console.log(approveResult.content?.[0]?.text);
