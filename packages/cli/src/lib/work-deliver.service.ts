/**
 * work-deliver.service.ts — `work deliver`: one command that proves a unit,
 * hands its proposal to review and publishes it.
 *
 * Delivering took four commands in an order an agent had to remember: the
 * proof, two transitions, and a publish when the proposal was already in
 * review. Every step was a call to pay for and a place to go wrong, and the
 * order is the product's to know. The proposal is moved to in-progress
 * first, from review too, which is how a pull request gets a fix; the
 * transition to review then publishes the unit.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import type { IWorkDeliverPorts } from '../contracts/interfaces/work-deliver.interface';
import { isRecord } from './helpers/cli-command.helper';

const refusalOf = (answer: unknown): string | undefined =>
	isRecord(answer) && answer.ok === false
		? String(answer.reason ?? 'the transition was refused')
		: undefined;

/** A refusal that only says the proposal already stands past that step. */
const alreadyPast = (reason: string, to: string): boolean =>
	reason.includes('illegal transition') &&
	!reason.includes(`"ready" → "${to}"`);

export const deliverUnit = async (
	ports: IWorkDeliverPorts,
): Promise<ICliCommandResult> => {
	// Opened first: a proposal in review that gained a slice is refused by
	// the proof's own lints until it stands in progress again.
	const started = refusalOf(await ports.transition('in-progress'));
	if (started !== undefined && !alreadyPast(started, 'in-progress')) {
		return { code: EXIT_CODE.VALIDATION, error: started };
	}
	const proved = await ports.prove();
	if (proved.code !== 0) return proved;
	const handed = refusalOf(await ports.transition('review'));
	return handed === undefined
		? {
				code: EXIT_CODE.OK,
				data: { delivered: 'review', proved: proved.data },
			}
		: { code: EXIT_CODE.VALIDATION, error: handed };
};
