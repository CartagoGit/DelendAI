/**
 * llm-fan-out.service.ts — dispatch one brief to N targets, a bounded
 * number at a time, never dropping a target.
 */
import { callLlm } from './llm-client.service';
import type {
	ILlmCallOutcome,
	ILlmClientOptions,
	IModelTarget,
} from './llm-client.service';

/** Targets dispatched at once; the rest of the queue waits for a free slot. */
const FAN_OUT_CONCURRENCY = 4;

/**
 * Dispatch one brief to N targets in parallel. Uses
 * `Promise.allSettled` semantics: the function never throws on a
 * provider failure — every target resolves to an {@link ILlmCallOutcome}.
 *
 * Concurrency is bounded to the lesser of the target list length and
 * 4 — beyond that, a host with many cores is rarely going to
 * benefit and we'd just be hammering providers with simultaneous
 * cold-start handshakes. The cap is documented in
 * `IPlanToolOptions` so hosts can override.
 */
export const callLlmFanOut = async (
	targets: readonly IModelTarget[],
	brief: string,
	options: ILlmClientOptions = {},
): Promise<readonly ILlmCallOutcome[]> => {
	const results: ILlmCallOutcome[] = new Array<ILlmCallOutcome>(
		targets.length,
	);
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < targets.length) {
			const index = next;
			next += 1;
			const target = targets[index];
			if (target !== undefined) {
				results[index] = await callLlm(target, brief, options);
			}
		}
	};
	await Promise.all(
		Array.from(
			{ length: Math.min(targets.length, FAN_OUT_CONCURRENCY) },
			worker,
		),
	);
	return results;
};
