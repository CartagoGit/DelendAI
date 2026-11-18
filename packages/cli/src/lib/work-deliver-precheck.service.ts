/**
 * work-deliver-precheck.service.ts — what `work deliver` refuses before it
 * takes the compute slot.
 *
 * The proof's static gates (lint presets with the unit-tier budget, the
 * mirror-spec rule, types-in-contracts and file size, biome, proposal
 * readiness) failed after minutes in a queue, on facts knowable in
 * seconds. The gate list is the proof's own: `prove --only=precheck`
 * expands to the static gates of its plan for the changed files, so there
 * is no second list here and the refusal carries the proof's messages.
 * The pre-check only refuses earlier; it never certifies a delivery.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import type { IWorkDeliverPorts } from '../contracts/interfaces/work-deliver.interface';

/** The pre-checks a delivery runs, in order, each a proof run of some gates. */
const stagesOf = (
	ports: Pick<IWorkDeliverPorts, 'precheck' | 'coveragePrecheck'>,
): readonly (() => Promise<ICliCommandResult>)[] => [
	ports.precheck,
	ports.coveragePrecheck,
];

/**
 * The refusal of the first pre-check that fails, in the proof's words;
 * undefined when every one passes and the delivery goes on to the slot.
 */
export const precheckDelivery = async (
	ports: Pick<IWorkDeliverPorts, 'precheck' | 'coveragePrecheck'>,
): Promise<ICliCommandResult | undefined> => {
	for (const stage of stagesOf(ports)) {
		const outcome = await stage();
		if (outcome.code !== 0) {
			return {
				code:
					outcome.code === EXIT_CODE.USAGE
						? EXIT_CODE.USAGE
						: EXIT_CODE.VALIDATION,
				error: `${outcome.error ?? 'a static gate refused the candidate'}\nrefused before the compute slot: fix it and deliver again; nothing was proved.`,
			};
		}
	}
	return undefined;
};
