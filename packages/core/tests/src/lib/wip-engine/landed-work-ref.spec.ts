/**
 * landed-work-ref.spec.ts — settling a work ref, with a fake git runner.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { settleLanded } from '../../../../src/lib/wip-engine/landed-work-ref';

const POLICY = expandProfile('shared-checkout-pr');
const WORK_BRANCH = 'wip/agent-a/x00001-S1-g1/work';

describe('a unit the forge retired is not put back', () => {
	it('[<50ms] pushes nothing and publishes nothing while the retired ref is on the forge', async () => {
		const calls: string[][] = [];
		const run = async (args: readonly string[]) => {
			calls.push([...args]);
			const [command = ''] = args;
			if (command === 'ls-remote') {
				return args.some((arg) => arg.includes('retired/'))
					? {
							ok: true,
							output: `${'a'.repeat(40)}\t${args.at(-1) ?? ''}`,
						}
					: { ok: true, output: '' };
			}
			if (command === 'ls-tree') {
				return {
					ok: true,
					output: 'docs/delendai/proposals/in-progress/x00001-topic.md',
				};
			}
			if (command === 'merge-base') return { ok: false, output: '' };
			return { ok: true, output: 'b'.repeat(40) };
		};
		const result = await settleLanded(run, POLICY, 'origin', WORK_BRANCH);
		expect(calls.some((call) => call[0] === 'push')).toBe(false);
		expect(result.outcome).not.toBe('published');
	});
});
