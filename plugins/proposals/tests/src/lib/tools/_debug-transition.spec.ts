import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@mcp-vertex/proposals/lib/tools/proposal-transition.tool';

const root = await mkdtemp(join(tmpdir(), 'transition-'));
const dir = join(root, 'ready');
await mkdir(dir, { recursive: true });
await writeFile(
	join(dir, 'f00014-do-thing.md'),
	'---\nid: f00014\nstatus: ready\ntype: feat\n---\n\n## Goal\n\np.\n',
	'utf8',
);
const options: IProposalTransitionToolOptions = {
	namespacePrefix: 'proposals',
	proposalsDirAbs: root,
	workspaceRoot: root,
	gitRunner: async (args) => {
		const [, from, to] = args;
		if (from && to) {
			const { rename } = await import('node:fs/promises');
			await rename(from, to);
		}
		return { ok: true, output: '' };
	},
};

const result = await runProposalTransition(
	{ id: 'f00014', to: 'in-progress', reason: 'claimed' },
	options,
);
console.log('isError:', result.isError);
console.log('text:', result.content?.[0]?.text);
await rm(root, { recursive: true, force: true });
