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
import type { IPlanOutcome } from './contracts.js';

/** Characters of an output the outcome keeps beside its reference. */
const OUTPUT_EXTRACT = 280;

const extract = (text: string): string =>
	text.length > OUTPUT_EXTRACT
		? `${text.slice(0, OUTPUT_EXTRACT - 1)}…`
		: text;

/**
 * `outcome` with each step's output kept by `keep` (which answers its
 * reference) and replaced by an extract.
 */
export const withReceipts = async (
	outcome: IPlanOutcome,
	keep: (id: string, output: string) => Promise<string>,
): Promise<IPlanOutcome> => ({
	...outcome,
	steps: await Promise.all(
		outcome.steps.map(async (step) => {
			if (
				step.result === null ||
				step.result.output.length <= OUTPUT_EXTRACT
			) {
				return step;
			}
			const outputRef = await keep(
				`${step.slotId}:${step.result.subagentId}`,
				step.result.output,
			);
			return {
				...step,
				result: {
					...step.result,
					output: extract(step.result.output),
					outputRef,
				},
			};
		}),
	),
});
