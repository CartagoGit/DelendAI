import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { findLinkedProposalId } from './proposals';

const writeProposal = async (
	root: string,
	relativePath: string,
	content: string,
): Promise<void> => {
	const filePath = join(root, relativePath);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content);
};

describe('findLinkedProposalId', () => {
	it('returns the proposal id when frontmatter branch matches', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'forge-proposals-'));
		try {
			await writeProposal(
				cwd,
				'docs/mcp-vertex/proposals/ready/f00121-forge-plugin.md',
				['---', 'id: f00121', 'branch: feat/forge-write', '---'].join(
					'\n',
				),
			);
			await expect(
				findLinkedProposalId('feat/forge-write', cwd),
			).resolves.toBe('f00121');
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it('falls back to branch prefix matching on the proposal id', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'forge-proposals-'));
		try {
			await writeProposal(
				cwd,
				'docs/mcp-vertex/proposals/done/feats/f00121-forge-plugin.md',
				['---', 'id: f00121', 'kind: feat', '---'].join('\n'),
			);
			await expect(
				findLinkedProposalId('agent/copilot-minimax-m3-f00121-s2', cwd),
			).resolves.toBe('f00121');
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it('returns undefined when nothing matches', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'forge-proposals-'));
		try {
			await writeProposal(
				cwd,
				'docs/mcp-vertex/proposals/ready/f00121-forge-plugin.md',
				['---', 'id: f00121', 'kind: feat', '---'].join('\n'),
			);
			await expect(
				findLinkedProposalId('feat/another-slice', cwd),
			).resolves.toBeUndefined();
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
