/**
 * create-proposal-moves-nothing.spec.ts — creating a proposal writes it
 * and its index entry, and moves no other file. In a consumer it moved 16
 * archived proposals into this repository's layout, which that project's
 * own lint then refused.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PROPOSAL_FOLDER_POLICY } from '@delendai/proposals/lib/contracts/proposal-folder-policy';
import { createProposalDocument } from '@delendai/proposals/lib/tools/authoring.tool';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('createProposalDocument', () => {
	it('leaves every other proposal where its project filed it', async () => {
		const root = mkdtempSync(join(tmpdir(), 'create-moves-nothing-'));
		roots.push(root);
		const proposals = join(root, 'docs/delendai/proposals');
		mkdirSync(join(proposals, 'done'), { recursive: true });
		mkdirSync(join(proposals, 'ready/fixes'), { recursive: true });
		mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
		// Filed flat in done/, where the default layout would want done/fixes/.
		const archived = join(proposals, 'done/x00001-an-old-fix.md');
		writeFileSync(
			archived,
			'---\nid: x00001\ntitle: "An old fix"\nkind: fix\nstatus: done\ntype: proposal\n---\n\n# x00001\n',
		);

		const created = await createProposalDocument(
			{ kind: 'fix', title: 'A new fix' },
			{
				workspaceRoot: root,
				proposalsDirAbs: proposals,
				counterPathAbs: join(
					root,
					'.cache/delendai/proposals/proposal-id-counters.json',
				),
				layout: {
					proposalsDir: 'docs/delendai/proposals',
					proposalIndexFile: '.cache/delendai/proposals/index.json',
				},
				extraFolders: [],
				folderPolicy: DEFAULT_PROPOSAL_FOLDER_POLICY,
			},
		);

		expect(created.ok).toBe(true);
		expect(existsSync(archived)).toBe(true);
		expect(
			existsSync(join(proposals, 'done/fixes/x00001-an-old-fix.md')),
		).toBe(false);
	});
});
