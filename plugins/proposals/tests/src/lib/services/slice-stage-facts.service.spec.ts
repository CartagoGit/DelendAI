/**
 * slice-stage-facts.service.spec.ts — a delivered slice's stage asks git
 * once per commit and branch whether the commit is on it.
 */
import { describe, expect, it } from 'vitest';

import { createSliceStageReader } from '@delendai/proposals/lib/services/slice-stage-facts.service';

const APPROVED =
	'S1 — work\n- **Status**: done\n- shipped-in: `abc1234`\n- review-state: done\n';

describe('createSliceStageReader', () => {
	it('reads integrated and released from the branches, asking each once', async () => {
		const asked: string[] = [];
		const onIntegrationOnly = async (args: readonly string[]) => {
			asked.push(args.join(' '));
			return { ok: args[3] === 'develop', output: '' };
		};
		const stageOf = createSliceStageReader(onIntegrationOnly, {
			integration: 'develop',
			release: 'main',
		});

		expect(await stageOf('done', APPROVED)).toBe('integrated');
		expect(await stageOf('done', APPROVED)).toBe('integrated');
		expect(asked).toEqual([
			'merge-base --is-ancestor abc1234 develop',
			'merge-base --is-ancestor abc1234 main',
		]);
	});

	it('reads released when the release branch has the commit', async () => {
		const stageOf = createSliceStageReader(
			async () => ({ ok: true, output: '' }),
			{ integration: 'develop', release: 'main' },
		);
		expect(await stageOf('done', APPROVED)).toBe('released');
	});

	it('asks nothing without git or a delivering commit', async () => {
		const stageOf = createSliceStageReader(undefined, {
			integration: 'develop',
		});
		expect(await stageOf('done', APPROVED)).toBe('reviewed');
		expect(
			await stageOf('pending', 'S2 — x\n- **Status**: pending\n'),
		).toBe('pending');
	});
});
