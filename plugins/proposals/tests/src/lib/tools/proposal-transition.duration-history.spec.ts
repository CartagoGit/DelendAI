import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ITransitionDurationInput } from '@delendai/state-telemetry/public';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IProposalDurationRecorder } from '@delendai/proposals/lib/contracts/interfaces/transition-duration.interface';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import {
	featureVectorOfProposal,
	measureTransition,
} from '@delendai/proposals/lib/tools/proposal-transition-duration';
import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@delendai/proposals/lib/tools/proposal-transition.tool';

const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	return { ok: true, output: '' };
};

const STARTED_AT = Date.parse('2026-10-07T10:00:00.000Z');
const FINISHED_AT = STARTED_AT + 90 * 60_000;

const BODY = [
	'## Slices',
	'',
	'### S1 — first',
	'- **Files**: `packages/a/src/x.ts`, `packages/a/src/x.spec.ts`',
	'',
	'### S2 — second',
	'- **Files**: `packages/b/src/public/index.ts`',
	'',
].join('\n');

const proposal = (stamp: string | undefined): string =>
	[
		'---',
		'id: f09999',
		'status: in-progress',
		'kind: feat',
		...(stamp === undefined ? [] : [`last-transition-at: ${stamp}`]),
		'---',
		'',
		BODY,
	].join('\n');

describe('transition duration history (f00511 S2)', () => {
	let root = '';
	let samples: ITransitionDurationInput[] = [];
	let options: IProposalTransitionToolOptions;
	const recorder: IProposalDurationRecorder = {
		record: (input) => {
			samples.push(input);
		},
	};

	const seed = async (stamp: string | undefined): Promise<void> => {
		await mkdir(join(root, 'in-progress'), { recursive: true });
		await writeFile(
			join(root, 'in-progress', 'f09999-fixture.md'),
			proposal(stamp),
			'utf8',
		);
	};

	const transition = (to: string) =>
		runProposalTransition(
			{
				id: 'f09999',
				to,
				reason: 'finished',
				force: true,
				agent: 'agent-one',
			},
			options,
		);

	beforeEach(async () => {
		samples = [];
		root = await mkdtemp(join(tmpdir(), 'transition-duration-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
			requireValidateEvidence: false,
			durationRecorder: recorder,
			now: () => FINISHED_AT,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('records how long the stretch that just ended took, off the critical path', async () => {
		await seed(new Date(STARTED_AT).toISOString());
		const result = await transition('review');
		expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({
			ok: true,
		});
		await Promise.resolve();
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			to: 'review',
			actorProfile: 'agent-one',
			taskKind: 'feat:review',
			durationMs: FINISHED_AT - STARTED_AT,
		});
		expect(samples[0]?.vector?.slice_count).toBe(2);
	});

	it('stamps the moment of every transition for the next measurement', async () => {
		await seed(undefined);
		await transition('review');
		const { readFile } = await import('node:fs/promises');
		const moved = await readFile(
			join(root, 'review', 'f09999-fixture.md'),
			'utf8',
		);
		expect(moved).toContain(
			`last-transition-at: ${new Date(FINISHED_AT).toISOString()}`,
		);
		await Promise.resolve();
		expect(samples).toHaveLength(0);
	});

	it('records nothing for a target that does not close a stretch', async () => {
		await seed(new Date(STARTED_AT).toISOString());
		await transition('blocked');
		await Promise.resolve();
		expect(samples).toHaveLength(0);
	});

	it('survives a recorder that throws', async () => {
		await seed(new Date(STARTED_AT).toISOString());
		options = {
			...options,
			durationRecorder: {
				record: () => {
					throw new Error('disk full');
				},
			},
		};
		const result = await transition('review');
		await Promise.resolve();
		expect(JSON.parse(result.content[0]?.text ?? '{}')).toMatchObject({
			ok: true,
		});
	});
});

describe('feature vector of a proposal', () => {
	it('counts slices, packages, tests and public surfaces from the document', () => {
		const vector = featureVectorOfProposal(BODY);
		expect(vector).toMatchObject({
			slice_count: 2,
			affected_packages: 2,
			test_count: 1,
			public_api_changes: 1,
		});
	});

	it('measures nothing without a start stamp or with a clock that went backwards', () => {
		const base = { to: 'done', agent: undefined, nowMs: STARTED_AT };
		expect(
			measureTransition({
				...base,
				previousMarkdown: proposal(undefined),
			}),
		).toBeUndefined();
		expect(
			measureTransition({
				...base,
				previousMarkdown: proposal(
					new Date(STARTED_AT + 1000).toISOString(),
				),
			}),
		).toBeUndefined();
	});

	it('falls back to an unknown actor and the proposal kind', () => {
		const sample = measureTransition({
			to: 'done',
			agent: undefined,
			nowMs: FINISHED_AT,
			previousMarkdown: proposal(new Date(STARTED_AT).toISOString()),
		});
		expect(sample?.actorProfile).toBe('unknown');
		expect(sample?.taskKind).toBe('feat:done');
	});
});
