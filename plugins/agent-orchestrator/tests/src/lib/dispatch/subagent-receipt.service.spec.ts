/**
 * subagent-receipt.service.spec.ts — the orchestrator reads a receipt and
 * a reference, not each subagent's whole output.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type { IPlanOutcome } from '../../../../src/lib/dispatch/contracts';
import {
	receiptLine,
	withReceipts,
} from '../../../../src/lib/dispatch/subagent-receipt.service';

const outcomeWith = (output: string): IPlanOutcome =>
	fakePartial<IPlanOutcome>({
		mode: 'linear',
		steps: [
			{
				order: 1,
				kind: 'spawn',
				slotId: 'slot-1',
				subagentIds: ['s1'],
				result: {
					subagentId: 's1',
					tokensUsed: 10,
					output,
					schemaOk: true,
					hadError: false,
					receipt: {
						status: 'done',
						filesChanged: ['a.ts'],
						checks: [{ command: 'typecheck', ok: true }],
						exceptions: [],
					},
				},
				rotations: [],
				ok: true,
			},
			{
				order: 2,
				kind: 'verify',
				slotId: 'slot-2',
				subagentIds: [],
				result: null,
				rotations: [],
				ok: true,
			},
		],
		budget: {
			consumedOrchestrator: 0,
			consumedSubagents: new Map(),
			steps: 2,
		},
		ok: true,
	});

describe('withReceipts', () => {
	it('keeps a long output behind a reference and leaves an extract and the receipt', async () => {
		const kept: Array<[string, string]> = [];
		const outcome = await withReceipts(
			outcomeWith('x'.repeat(1000)),
			async (id, output) => {
				kept.push([id, output]);
				return `output:${id}@abc`;
			},
		);
		const [step] = outcome.steps;
		expect(kept).toEqual([['slot-1:s1', 'x'.repeat(1000)]]);
		expect(step?.result?.outputRef).toBe('output:slot-1:s1@abc');
		expect(step?.result?.output).toHaveLength(280);
		expect(step?.result?.receipt).toBe(
			'done · files: a.ts · checks: typecheck ok · needs: none',
		);
		expect(outcome.steps[1]?.result).toBeNull();
	});

	it('renders an empty receipt as none, and keeps the whole output without a store', async () => {
		const outcome = await withReceipts(outcomeWith('y'.repeat(1000)));
		expect(outcome.steps[0]?.result?.output).toHaveLength(1000);
		expect(
			receiptLine({
				status: 'failed',
				filesChanged: [],
				checks: [{ command: 'tests', ok: false }],
				exceptions: ['pick a name'],
			}),
		).toBe(
			'failed · files: none · checks: tests failed · needs: pick a name',
		);
		expect(
			receiptLine({
				status: 'done',
				filesChanged: [],
				checks: [],
				exceptions: [],
			}),
		).toBe('done · files: none · checks: none · needs: none');
	});

	it('leaves a short output where it is', async () => {
		const outcome = await withReceipts(outcomeWith('done'), async () => {
			throw new Error('nothing to keep');
		});
		expect(outcome.steps[0]?.result?.output).toBe('done');
		expect(outcome.steps[0]?.result?.outputRef).toBeUndefined();
	});
});
