/**
 * work-deliver.service.spec.ts — one command proves, hands over and
 * publishes, stops at the first refusal, and republishes what is in review.
 */
import { describe, expect, it } from 'vitest';

import {
	EXIT_CODE,
	type IExitCode,
} from '../contracts/constants/exit-code.constant';
import type { IWorkDeliverPorts } from '../contracts/interfaces/work-deliver.interface';
import {
	answerOf,
	deliverUnit,
	pullRequestOf,
	unitFlagsOf,
} from './work-deliver.service';

const ports = (
	answers: {
		'in-progress'?: unknown;
		review?: unknown;
		preflight?: unknown;
	},
	proveCode: IExitCode = EXIT_CODE.OK,
	slice = 'all',
	readPullRequest: IWorkDeliverPorts['readOpenPullRequest'] = async () =>
		undefined,
	precheckCode: IExitCode = EXIT_CODE.OK,
) => {
	const calls: string[] = [];
	const value: IWorkDeliverPorts = {
		slice,
		preflight: async (checkout) => {
			expect(checkout).toBe('/unit');
			calls.push('preflight');
			return answers.preflight ?? { ok: true };
		},
		publish: async () => {
			calls.push('publish');
			return { code: EXIT_CODE.OK, data: 'pr/slice' };
		},
		readOpenPullRequest: readPullRequest,
		locate: async () => ({
			code: EXIT_CODE.OK,
			data: { worktree: '/unit', publication: 'pr/unit' },
		}),
		precheck: async () => {
			calls.push('precheck');
			return precheckCode === EXIT_CODE.OK
				? { code: precheckCode, data: { partial: true } }
				: {
						code: precheckCode,
						error: 'lint-presets: spec over budget',
					};
		},
		prove: async () => {
			calls.push('prove');
			return proveCode === EXIT_CODE.OK
				? { code: proveCode, data: { proved: true } }
				: { code: proveCode, error: 'its proof failed' };
		},
		transition: async (to, checkout) => {
			expect(checkout).toBe('/unit');
			calls.push(to);
			return answers[to] ?? { ok: true };
		},
	};
	return { calls, value };
};

const illegal = (from: string, to: string) => ({
	ok: false,
	reason: `illegal transition: "${from}" → "${to}"`,
});

const inReview = {
	...illegal('review', 'review'),
	code: 'already-in-review',
	error: { code: 'already-in-review', reason: 'x' },
};

describe('deliverUnit', () => {
	it("[<20ms] refuses with the proof's message before the proof takes its slot when a static gate fails", async () => {
		const { calls, value } = ports(
			{},
			EXIT_CODE.OK,
			'all',
			async () => undefined,
			EXIT_CODE.VALIDATION,
		);
		const result = await deliverUnit(value);
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(result.error).toContain('lint-presets: spec over budget');
		expect(calls).toEqual(['in-progress', 'preflight', 'precheck']);
	});

	it('[<20ms] opens the proposal, proves the unit, then hands it to review', async () => {
		const { calls, value } = ports({});
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.OK);
		expect(calls).toEqual([
			'in-progress',
			'preflight',
			'precheck',
			'prove',
			'review',
		]);
	});

	it('[<20ms] hands nothing over after a partial proof, which proves nothing', async () => {
		const { calls, value } = ports({});
		const result = await deliverUnit({
			...value,
			prove: async () => ({
				code: EXIT_CODE.OK,
				data: { partial: true, proved: false },
			}),
		});
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(calls).not.toContain('review');
	});

	it('[<20ms] hands nothing over when the proof fails', async () => {
		const { calls, value } = ports({}, EXIT_CODE.VALIDATION);
		expect(await deliverUnit(value)).toMatchObject({
			error: 'its proof failed',
		});
		expect(calls).toEqual([
			'in-progress',
			'preflight',
			'precheck',
			'prove',
		]);
	});

	it('[<20ms] goes on from a proposal already in progress', async () => {
		const { calls, value } = ports({
			'in-progress': illegal('in-progress', 'in-progress'),
		});
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.OK);
		expect(calls).toEqual([
			'in-progress',
			'preflight',
			'precheck',
			'prove',
			'review',
		]);
	});

	it('[<20ms] stops with the reason of any other refusal', async () => {
		const reason = 'S1: nothing records which commit delivered it';
		const late = ports({ review: { ok: false, reason } });
		expect(await deliverUnit(late.value)).toMatchObject({ error: reason });
		const early = ports({ 'in-progress': { ok: false, reason } });
		expect((await deliverUnit(early.value)).error).toBe(reason);
		expect(early.calls).toEqual(['in-progress']);
	});

	it("[<20ms] says the tool's reason wherever it put it, and where the work went", async () => {
		const nested = ports({
			'in-progress': { ok: false, error: { reason: 'no such proposal' } },
		});
		expect((await deliverUnit(nested.value)).error).toBe(
			'no such proposal',
		);
		const bare = ports({ 'in-progress': { ok: false } });
		expect((await deliverUnit(bare.value)).error).toContain('{"ok":false}');
		expect((await deliverUnit(ports({}).value)).data).toMatchObject({
			publication: 'pr/unit',
		});
	});
});

describe('deliverUnit, a proposal already in review', () => {
	it('[<20ms] publishes the new tip instead of failing on the transition', async () => {
		const { calls, value } = ports({
			review: inReview,
		});
		const result = await deliverUnit(value);
		expect(result).toMatchObject({
			code: EXIT_CODE.OK,
			data: {
				delivered: 'review',
				republished: true,
				publication: 'pr/slice',
				pullRequest: { pending: true, branch: 'pr/unit' },
			},
		});
		expect(calls).toEqual([
			'in-progress',
			'preflight',
			'precheck',
			'prove',
			'review',
			'publish',
		]);
	});

	it('[<20ms] reports the pull request the publication answered with', async () => {
		const { value } = ports({ review: inReview });
		const result = await deliverUnit({
			...value,
			publish: async () => ({
				code: EXIT_CODE.OK,
				data: { pullRequest: { url: 'https://x/o/r/pull/7' } },
			}),
		});
		expect(result.data).toMatchObject({
			republished: true,
			pullRequest: { number: 7, url: 'https://x/o/r/pull/7' },
		});
	});

	it('[<20ms] fails when the republication fails, on the wording without the code, and on any other refusal', async () => {
		const { value } = ports({ review: inReview });
		const failed = await deliverUnit({
			...value,
			publish: async () => ({
				code: EXIT_CODE.VALIDATION,
				error: 'push refused',
			}),
		});
		expect(failed).toMatchObject({ error: 'push refused' });
		const worded = ports({ review: illegal('review', 'review') });
		expect((await deliverUnit(worded.value)).code).toBe(
			EXIT_CODE.VALIDATION,
		);
		expect(worded.calls).not.toContain('publish');
		const other = ports({ review: illegal('ready', 'review') });
		expect((await deliverUnit(other.value)).code).toBe(
			EXIT_CODE.VALIDATION,
		);
		expect(other.calls).not.toContain('publish');
	});
});

describe('deliverUnit, one slice of several', () => {
	const undelivered = (slices: string) => ({
		ok: false,
		error: {
			code: 'undelivered-slices',
			reason: `${slices}: no commit on this branch changes the slice’s declared files`,
		},
	});

	it('[<20ms] publishes only the slice it proved while others are undelivered', async () => {
		const { calls, value } = ports(
			{ preflight: undelivered('S3, S4, S6') },
			EXIT_CODE.OK,
			'S1',
		);
		expect(await deliverUnit(value)).toMatchObject({
			code: EXIT_CODE.OK,
			data: { delivered: 'slice', remaining: ['S3', 'S4', 'S6'] },
		});
		expect(calls).toEqual([
			'in-progress',
			'preflight',
			'precheck',
			'prove',
			'publish',
		]);
	});

	it('[<20ms] refuses when the slice it proved is itself undelivered', async () => {
		const { calls, value } = ports(
			{ preflight: undelivered('S1, S4') },
			EXIT_CODE.OK,
			'S1',
		);
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.VALIDATION);
		expect(calls).toEqual(['in-progress', 'preflight']);
	});

	it('[<20ms] keeps handing a whole proposal over, refusal included', async () => {
		const { calls, value } = ports({ preflight: undelivered('S3') });
		expect((await deliverUnit(value)).code).toBe(EXIT_CODE.VALIDATION);
		expect(calls).toEqual(['in-progress', 'preflight']);
	});

	it('[<20ms] refuses before the proof when a declared file is missing', async () => {
		const { calls, value } = ports({
			preflight: {
				ok: false,
				error: {
					code: 'missing-declared-files',
					reason: 'declared files do not exist: a.ts',
				},
			},
		});
		expect(await deliverUnit(value)).toMatchObject({
			error: 'declared files do not exist: a.ts',
		});
		expect(calls).not.toContain('prove');
	});
});

describe('answerOf', () => {
	it('[<20ms] reads the refusal a failed call carries, and passes an answer through', async () => {
		const refusal = {
			ok: false,
			reason: 'illegal transition: "in-progress" → "in-progress"',
		};
		const failed = Object.assign(new Error('returned an error'), {
			result: {
				content: [{ type: 'text', text: JSON.stringify(refusal) }],
				isError: true,
			},
		});
		await expect(answerOf(Promise.reject(failed))).resolves.toEqual(
			refusal,
		);
		await expect(answerOf(Promise.resolve({ ok: true }))).resolves.toEqual({
			ok: true,
		});
	});

	it('[<20ms] keeps an error that carries no answer', async () => {
		const bare = new Error('Connection closed');
		await expect(answerOf(Promise.reject(bare))).rejects.toBe(bare);
		const prose = Object.assign(new Error('x'), {
			result: { content: [{ text: 'not json' }] },
		});
		await expect(answerOf(Promise.reject(prose))).rejects.toBe(prose);
	});
});

describe('unitFlagsOf', () => {
	const parse = (ref: string) =>
		ref === 'refs/heads/delendai/wip/a/implement/x1-S2-g2/the-fix'
			? { proposal: 'x1', slice: 'S2', generation: 2, topic: 'the-fix' }
			: undefined;

	it('[<20ms] names the unit of the branch a delivery runs on', () => {
		expect(
			unitFlagsOf(
				'delendai/wip/a/implement/x1-S2-g2/the-fix',
				'x1',
				parse,
			),
		).toEqual(['--slice=S2', '--generation=2', '--topic=the-fix']);
	});

	it('[<20ms] names the kind of a create unit, so deliver finds it', () => {
		expect(
			unitFlagsOf('delendai/wip/a/create/x1-all-g2/t', 'x1', () => ({
				proposal: 'x1',
				kind: 'create',
				slice: 'all',
				generation: 2,
				topic: 't',
			})),
		).toEqual([
			'--kind=create',
			'--slice=all',
			'--generation=2',
			'--topic=t',
		]);
	});

	it('[<20ms] names nothing off a unit, or on another proposal', () => {
		expect(unitFlagsOf('develop', 'x1', parse)).toEqual([]);
		expect(unitFlagsOf(undefined, 'x1', parse)).toEqual([]);
		expect(
			unitFlagsOf(
				'delendai/wip/a/implement/x1-S2-g2/the-fix',
				'x2',
				parse,
			),
		).toEqual([]);
	});
});

describe('pullRequestOf', () => {
	it('[<20ms] gives the number and URL the publication answered with', () => {
		expect(
			pullRequestOf(
				{
					pullRequest: {
						status: 'opened',
						url: 'https://h/o/r/pull/12',
					},
				},
				'pr/b',
			),
		).toEqual({ url: 'https://h/o/r/pull/12', number: 12 });
	});

	it('[<20ms] says the pull request is pending, with the branch, when none answered', () => {
		expect(pullRequestOf(undefined, 'pr/b')).toEqual({
			pending: true,
			branch: 'pr/b',
			message: expect.stringContaining(
				'the forge opens the pull request',
			),
		});
	});

	it('[<20ms] explains a whole-proposal branch named all for a unit of S1', () => {
		expect(
			pullRequestOf(undefined, 'pr/a/implement/x1-all-g1/work', 'S1'),
		).toMatchObject({
			slice: 'S1',
			sliceNote: expect.stringContaining('S1'),
		});
		expect(
			pullRequestOf(undefined, 'pr/a/implement/x1-S1-g1/work', 'S1'),
		).not.toHaveProperty('sliceNote');
	});

	it('[<20ms] explains a whole-proposal branch in the scope grammar too', () => {
		for (const branch of [
			'pr/implement/a/x00001/work',
			'pr/implement/a/x00001-G2/work',
		]) {
			expect(pullRequestOf(undefined, branch, 'S1')).toMatchObject({
				slice: 'S1',
				sliceNote: expect.stringContaining('S1'),
			});
		}
		expect(
			pullRequestOf(undefined, 'pr/implement/a/x00001-S1/work', 'S1'),
		).not.toHaveProperty('sliceNote');
	});

	it('[<20ms] reaches a delivery that hands the proposal to review', async () => {
		const { value } = ports({});
		const result = await deliverUnit(value);
		expect(result.data).toMatchObject({
			pullRequest: { pending: true, branch: 'pr/unit' },
		});
	});

	it('[<20ms] names the pull request the forge read finds when publication had none', async () => {
		const { value } = ports({}, EXIT_CODE.OK, 'all', async (branch) => {
			expect(branch).toBe('pr/unit');
			return 'https://h/o/r/pull/7';
		});
		const result = await deliverUnit(value);
		expect(result.data).toMatchObject({
			pullRequest: { url: 'https://h/o/r/pull/7', number: 7 },
		});
	});

	it('[<20ms] answers pending without a publish command when the forge has none or the read fails', async () => {
		const failing = ports({}, EXIT_CODE.OK, 'all', async () => {
			throw new Error('gh failed');
		});
		for (const { value } of [ports({}), failing]) {
			const result = await deliverUnit(value);
			const request = (result.data as Record<string, unknown>)
				.pullRequest as Record<string, unknown>;
			expect(request).toMatchObject({ pending: true, branch: 'pr/unit' });
			expect(request.message).toContain('delendai work status');
			expect(request.message).toContain('nothing is left to do');
			expect(request.message).not.toContain('work publish');
		}
	});
});
