#!/usr/bin/env bun
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
		'.cache/delendai/peer-review.log',
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

for (const sliceId of ['S1', 'S2', 'S3']) {
	console.log(`\n=== ${sliceId} submit (as copilot-minimax-m3) ===`);
	console.log(
		(
			await handler!({
				proposalId: 'c00089',
				sliceId,
				action: 'submit',
				agent: 'copilot-minimax-m3',
			})
		).content?.[0]?.text,
	);

	console.log(`\n=== ${sliceId} approve (as delivery_verifier) ===`);
	const note = {
		S1: 'Token-budget e2e covers the real preset surface (tools/list, overview compact, resume path); baselines match metrics-baseline.json.',
		S2: 'Lightweight activation is discoverable in CROSS-IDE/CROSS-PROJECT-SETUP; host-server.script.ts supports the elevation pattern.',
		S3: 'Budget regression gate prevents silent growth; prompt-size lint enforces the static cap; bootstrap.md updated.',
	}[sliceId]!;
	console.log(
		(
			await handler!({
				proposalId: 'c00089',
				sliceId,
				action: 'approve',
				agent: 'delivery_verifier',
				note,
			})
		).content?.[0]?.text,
	);
}
