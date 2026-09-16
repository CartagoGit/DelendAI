/**
 * authoring-refusals.spec.ts — the answers `create_proposal` gives when
 * it will NOT write a document, and the two smaller surfaces around it.
 *
 * `createProposalDocument` is the one place that decides whether a
 * proposal exists at all. Its happy path is well covered through the
 * tool; its refusals were not covered anywhere, and each of them is a
 * message an agent has to act on — an unknown kind, an id that
 * contradicts its kind, neither of the two, slices that collide, or a
 * title that cannot produce a canonical filename. A refusal that says
 * the wrong thing is worse than no refusal, because the agent retries
 * the same way.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createProposalDocument,
	readActiveLocks,
	type IAuthoringToolOptions,
} from '@delendai/proposals/lib/tools/authoring.tool';
import { DEFAULT_PROPOSAL_FOLDER_POLICY } from '@delendai/proposals/lib/contracts/proposal-folder-policy';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

type TCreateOptions = Pick<
	IAuthoringToolOptions,
	| 'workspaceRoot'
	| 'proposalsDirAbs'
	| 'counterPathAbs'
	| 'layout'
	| 'extraFolders'
	| 'folderPolicy'
>;

const makeOptions = (): TCreateOptions => {
	const root = mkdtempSync(join(tmpdir(), 'authoring-refusals-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
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

/** Narrow the union to the refusal arm, with the reason in the message. */
const refusalOf = async (
	args: Parameters<typeof createProposalDocument>[0],
): Promise<{ readonly reason: string; readonly nextAction: string }> => {
	const result = await createProposalDocument(args, makeOptions());
	if (result.ok) {
		throw new Error(
			`expected a refusal, got a written proposal at ${result.path}`,
		);
	}
	return { reason: result.reason, nextAction: result.nextAction };
};

describe('createProposalDocument refuses, and says what to do instead', () => {
	it('names the kind it does not recognise', async () => {
		const refusal = await refusalOf({
			kind: 'not-a-kind',
			title: 'Unknown kind',
		});

		expect(refusal.reason).toMatch(/unknown kind "not-a-kind"/u);
		expect(refusal.nextAction).toMatch(/recognised kind/u);
	});

	it('asks for one of the two ways to have an id', async () => {
		const refusal = await refusalOf({ title: 'No id and no kind' });

		expect(refusal.reason).toBe('either id or kind is required');
		expect(refusal.nextAction).toMatch(/auto-allocate/u);
	});

	it('refuses an id whose family contradicts the kind it was given', async () => {
		// `f` is the feat family; asking for a fix under it would file the
		// proposal where no fix can be found.
		const refusal = await refusalOf({
			id: 'f00901',
			kind: 'fix',
			title: 'Mismatched family',
		});

		expect(refusal.reason.length).toBeGreaterThan(0);
		expect(refusal.nextAction).toMatch(/prefix matches/iu);
	});

	it('refuses slices that would have two agents editing one file', async () => {
		const refusal = await refusalOf({
			kind: 'feat',
			title: 'Colliding slices',
			slices: [
				{ sliceId: 's1', files: ['src/shared.ts'] },
				{ sliceId: 's2', files: ['src/shared.ts', 'src/other.ts'] },
			],
		});

		expect(refusal.reason).toMatch(/slices share files/u);
		expect(refusal.reason).toContain('src/shared.ts');
		expect(refusal.nextAction).toMatch(/disjoint/u);
	});

	it('falls back to the id when a title sanitises away entirely', async () => {
		// Punctuation-only kebabs to nothing. Rather than write a filename
		// the registry could never match, the slug falls back to the id, so
		// the file stays canonical and findable.
		const result = await createProposalDocument(
			{ id: 'f00902', title: '!!! ???' },
			makeOptions(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.file).toMatch(/f00902-f00902\.md$/u);
	});

	it('writes the document when the id is explicit and well formed', async () => {
		const result = await createProposalDocument(
			{
				id: 'f00903',
				title: 'An explicitly numbered proposal',
				goal: 'prove the accepted path still writes',
				slices: [{ sliceId: 's1', files: ['src/one.ts'] }],
			},
			makeOptions(),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.file).toMatch(
			/f00903-an-explicitly-numbered-proposal\.md$/u,
		);
		expect(result.disjointnessIssues).toEqual([]);
	});
});

describe('readActiveLocks', () => {
	it('reads no claims at all when the lock file is absent', async () => {
		const root = mkdtempSync(join(tmpdir(), 'locks-absent-'));
		roots.push(root);

		expect(await readActiveLocks(join(root, 'agents.lock.json'))).toEqual(
			[],
		);
	});

	it('keeps the entries that identify a task and names an absent agent', async () => {
		const root = mkdtempSync(join(tmpdir(), 'locks-'));
		roots.push(root);
		const lockPath = join(root, 'agents.lock.json');
		writeFileSync(
			lockPath,
			JSON.stringify({
				in_flight: [
					{ task_id: 'f00903.s1', agent: 'Carthage' },
					// No task_id: nothing to release, so nothing to report.
					{ agent: 'Sumer' },
					// A claim whose agent was never recorded still holds files.
					{ task_id: 'f00903.s2' },
				],
			}),
			'utf8',
		);

		expect(await readActiveLocks(lockPath)).toEqual([
			{ taskId: 'f00903.s1', agent: 'Carthage' },
			{ taskId: 'f00903.s2', agent: 'unknown' },
		]);
	});
});
