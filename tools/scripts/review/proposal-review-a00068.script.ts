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

const result = await handler({
	proposalId: 'a00068',
	sliceId: 'S1',
	action: 'approve',
	agent: 'delivery_verifier',
	note: 'Audit complete with comprehensive findings grounded in file:line evidence; recommendations actionable and prioritized; tests-status-context disclaimer preserved.',
});

const text = result.content?.[0]?.text ?? '';
console.log(text);
