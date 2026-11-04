/**
 * create-proposal-retry.spec.ts — a create whose answer was lost is safe
 * to repeat. Two timed-out calls used to leave two proposals with two
 * different ids for one intended document.
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PROPOSAL_FOLDER_POLICY } from '@delendai/proposals/lib/contracts/proposal-folder-policy';
import { CREATE_PROPOSAL_REFUSED_NEXT_STEP } from '@delendai/proposals/lib/contracts/constants/create-proposal.constant';
import {
	buildCreateProposalRegistration,
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

describe('createProposalDocument headings', () => {
	it('writes the canonical lower-case sections in the canonical order', async () => {
		const options = makeOptions();

		const created = await createProposalDocument(
			{ kind: 'fix', title: 'Headings are canonical' },
			options,
		);

		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const headings = readFileSync(created.path, 'utf8')
			.split('\n')
			.filter((line) => line.startsWith('## '));
		expect(headings).toEqual([
			'## goal',
			'## why',
			'## non-goals',
			'## slices',
			'## acceptance',
		]);
	});
});

describe('the refusal of create_proposal in the shared checkout', () => {
	it('names the create unit for the proposal new, which has no id to enter', () => {
		const registration = buildCreateProposalRegistration(
			fakePartial<IAuthoringToolOptions>({}),
		);

		expect(registration.refusedWriteNextStep).toBe(
			CREATE_PROPOSAL_REFUSED_NEXT_STEP,
		);
		expect(CREATE_PROPOSAL_REFUSED_NEXT_STEP).toContain(
			'work enter --kind=create --proposal=new',
		);
	});
});
