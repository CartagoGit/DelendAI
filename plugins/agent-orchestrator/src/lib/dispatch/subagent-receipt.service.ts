/**
 * subagent-receipt.service.ts — the orchestrator reads a receipt, not a
 * transcript.
 *
 * A dispatch returned every subagent's whole output to the orchestrator,
 * which read it all to decide what happened: the expensive model paid for
 * the cheap one's work twice. Each output is now kept behind a reference,
 * and the outcome carries the receipt the host returned, the reference
 * and a short extract.
 */
import type { IHostSubagentReceipt } from '@delendai/contracts';

import type { IPlanOutcome } from './contracts.js';

/** Characters of an output the outcome keeps beside its reference. */
const OUTPUT_EXTRACT = 280;

const extract = (text: string): string =>
	text.length > OUTPUT_EXTRACT
		? `${text.slice(0, OUTPUT_EXTRACT - 1)}…`
		: text;

/** A receipt as the orchestrator reads it: one line. */
export const receiptLine = (receipt: IHostSubagentReceipt): string =>
	[
		receipt.status,
		`files: ${receipt.filesChanged.length > 0 ? receipt.filesChanged.join(', ') : 'none'}`,
		`checks: ${receipt.checks.length > 0 ? receipt.checks.map((check) => `${check.command} ${check.ok ? 'ok' : 'failed'}`).join(', ') : 'none'}`,
		`needs: ${receipt.exceptions.length > 0 ? receipt.exceptions.join('; ') : 'none'}`,
	].join(' · ');

/**
 * `outcome` as the orchestrator reads it: each receipt on one line, and
 * each long output kept by `keep` (which answers its reference) and
 * replaced by an extract. Without `keep`, the output stays whole.
 */
export const withReceipts = async (
	outcome: IPlanOutcome,
	keep?: (id: string, output: string) => Promise<string>,
): Promise<IPlanOutcome> => ({
	...outcome,
	steps: await Promise.all(
		outcome.steps.map(async (step) => {
			if (step.result === null) return step;
			const { receipt, ...rest } = step.result;
			const result = {
				...rest,
				...(receipt === undefined
					? {}
					: {
							receipt:
								typeof receipt === 'string'
									? receipt
									: receiptLine(receipt),
						}),
			};
			if (keep === undefined || rest.output.length <= OUTPUT_EXTRACT) {
				return { ...step, result };
			}
			const outputRef = await keep(
				`${step.slotId}:${rest.subagentId}`,
				rest.output,
			);
			return {
				...step,
				result: { ...result, output: extract(rest.output), outputRef },
			};
		}),
	),
});
