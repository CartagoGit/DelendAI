/**
 * work-deliver.service.ts — `work deliver`: one command that proves a unit,
 * hands its proposal to review and publishes it.
 *
 * Delivering took four commands in an order an agent had to remember: the
 * proof, two transitions, and a publish when the proposal was already in
 * review. Every step was a call to pay for and a place to go wrong, and the
 * order is the product's to know. The transition to review publishes the
 * unit; a proposal already there, which is how a pull request gets a fix,
 * only needs publishing again.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import { isRecord } from './helpers/cli-command.helper';

/** What delivering needs from the unit engine and the proposals tool. */
export interface IWorkDeliverPorts {
	readonly prove: () => Promise<ICliCommandResult>;
	readonly publish: () => Promise<ICliCommandResult>;
	readonly transition: (
		to: 'in-progress' | 'review',
		checkout: string | undefined,
	) => Promise<unknown>;
}

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
	const proved = await ports.prove();
	if (proved.code !== 0) return proved;
	const checkout =
		isRecord(proved.data) && typeof proved.data.worktree === 'string'
			? proved.data.worktree
			: undefined;
	const started = refusalOf(await ports.transition('in-progress', checkout));
	if (started !== undefined && !alreadyPast(started, 'in-progress')) {
		return { code: EXIT_CODE.VALIDATION, error: started };
	}
	const handed = refusalOf(await ports.transition('review', checkout));
	if (handed === undefined) {
		return {
			code: EXIT_CODE.OK,
			data: { delivered: 'review', proved: proved.data },
		};
	}
	// Already in review: a fix to its pull request is published, no more.
	return alreadyPast(handed, 'review')
		? ports.publish()
		: { code: EXIT_CODE.VALIDATION, error: handed };
};
