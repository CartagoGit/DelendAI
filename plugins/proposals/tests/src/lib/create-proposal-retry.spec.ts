/**
 * create-proposal-retry.spec.ts — a create whose answer was lost is safe
 * to repeat. Two timed-out calls used to leave two proposals with two
 * different ids for one intended document.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PROPOSAL_FOLDER_POLICY } from '@delendai/proposals/lib/contracts/proposal-folder-policy';
import {
	createProposalDocument,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeOptions = (): Pick<
	IAuthoringToolOptions,
	| 'workspaceRoot'
	| 'proposalsDirAbs'
	| 'counterPathAbs'
	| 'layout'
	| 'extraFolders'
	| 'folderPolicy'
> => {
	const root = mkdtempSync(join(tmpdir(), 'create-retry-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready/fixes'), {
		recursive: true,
	});
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	return {
		workspaceRoot: root,
		proposalsDirAbs: join(root, 'docs/delendai/proposals'),
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
	};
};

const filesOf = (options: { readonly proposalsDirAbs: string }): string[] =>
	readdirSync(join(options.proposalsDirAbs, 'ready/fixes'));

describe('createProposalDocument when the same create is repeated', () => {
	it('returns the proposal the first call wrote instead of minting a second id', async () => {
		const options = makeOptions();
		const args = { kind: 'fix', title: 'Ids come from one source' };

		const first = await createProposalDocument(args, options);
		const second = await createProposalDocument(args, options);

		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(second.id).toBe(first.id);
		expect(second.path).toBe(first.path);
		expect(second.reused).toBe(true);
		expect(first.reused).toBeUndefined();
		expect(filesOf(options)).toHaveLength(1);
	});

	it('still mints a new id for a different title', async () => {
		const options = makeOptions();

		const first = await createProposalDocument(
			{ kind: 'fix', title: 'One thing' },
			options,
		);
		const second = await createProposalDocument(
			{ kind: 'fix', title: 'Another thing' },
			options,
		);

		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(second.id).not.toBe(first.id);
		expect(filesOf(options)).toHaveLength(2);
	});
});
