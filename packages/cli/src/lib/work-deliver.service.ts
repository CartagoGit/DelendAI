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

const textOf = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

/** Why the tool refused, in its words wherever it put them. */
const refusalOf = (answer: unknown): string | undefined => {
	if (!isRecord(answer) || answer.ok !== false) return undefined;
	const detail = isRecord(answer.error) ? answer.error.reason : answer.error;
	return (
		textOf(answer.reason) ??
		textOf(detail) ??
		`the transition was refused: ${JSON.stringify(answer)}`
	);
};

/**
 * The tool's answer, a refusal included. A tool reached through the
 * resolver that refuses now fails the call, as a direct call does; the
 * refusal it carries is what this flow reads to tell "already past that
 * step" from a real refusal, so it is read back from the error.
 */
export const answerOf = async (call: Promise<unknown>): Promise<unknown> => {
	try {
		return await call;
	} catch (error) {
		const result = isRecord(error) ? error.result : undefined;
		const content = isRecord(result) ? result.content : undefined;
		const text = Array.isArray(content)
			? (content as readonly unknown[])
					.map((part) => (isRecord(part) ? part.text : undefined))
					.find((part): part is string => typeof part === 'string')
			: undefined;
		if (text === undefined) throw error;
		try {
			return JSON.parse(text) as unknown;
		} catch {
			throw error;
		}
	}
};

/**
 * The unit flags of the branch a delivery runs on, when it is a unit of
 * `proposal`; none otherwise. Run from a unit's worktree with no
 * `--slice`, deliver looked for the proposal's `all` unit of the first
 * generation, and refused a unit entered for S2 in its second.
 */
export const unitFlagsOf = (
	branch: string | undefined,
	proposal: string,
	parse: (ref: string) =>
		| {
				readonly proposal: string;
				readonly slice: string;
				readonly generation: number;
				readonly topic?: string | undefined;
		  }
		| undefined,
): readonly string[] => {
	const unit =
		branch === undefined ? undefined : parse(`refs/heads/${branch}`);
	return unit === undefined || unit.proposal !== proposal
		? []
		: [
				`--slice=${unit.slice}`,
				`--generation=${String(unit.generation)}`,
				...(unit.topic === undefined ? [] : [`--topic=${unit.topic}`]),
			];
};

/** A refusal that only says the proposal already stands past that step. */
const alreadyPast = (reason: string, to: string): boolean =>
	reason.includes('illegal transition') &&
	!reason.includes(`"ready" → "${to}"`);

/** The tool's code for a proposal whose other slices have no delivering commit. */
const UNDELIVERED_CODE = 'undelivered-slices';

/**
 * The slices a refusal names as undelivered: the tool writes them first,
 * `S3, S4: no commit on this branch changes …`. None when the refusal is
 * another one.
 */
export const undeliveredSlicesOf = (
	answer: unknown,
): readonly string[] | undefined => {
	if (!isRecord(answer) || answer.ok !== false) return undefined;
	const detail = isRecord(answer.error) ? answer.error : answer;
	if (detail.code !== UNDELIVERED_CODE && answer.code !== UNDELIVERED_CODE)
		return undefined;
	const reason = refusalOf(answer) ?? '';
	const listed = /^((?:[A-Za-z]\w*)(?:, [A-Za-z]\w*)*):/u.exec(reason)?.[1];
	return listed?.split(', ');
};

/**
 * Whether a refusal only says other slices are undelivered, with the slice
 * this unit was entered for delivered: the proposal is not for review
 * yet, and this unit publishes alone.
 */
const othersRemaining = (
	answer: unknown,
	slice: string,
): readonly string[] | undefined => {
	const undelivered = undeliveredSlicesOf(answer);
	return undelivered !== undefined &&
		slice !== 'all' &&
		!undelivered.includes(slice)
		? undelivered
		: undefined;
};

export const deliverUnit = async (
	ports: IWorkDeliverPorts,
): Promise<ICliCommandResult> => {
	const located = await ports.locate();
	if (located.code !== 0) return located;
	const unit = isRecord(located.data) ? located.data : {};
	const checkout = textOf(unit.worktree);
	// Opened first: a proposal in review that gained a slice is refused by
	// the proof's own lints until it stands in progress again.
	const started = refusalOf(await ports.transition('in-progress', checkout));
	if (started !== undefined && !alreadyPast(started, 'in-progress')) {
		return { code: EXIT_CODE.VALIDATION, error: started };
	}
	// What the hand-over would refuse is refused now, in seconds, not after
	// the proof: the same checks, run by the tool that makes the transition.
	const expected = await ports.preflight(checkout);
	const unmet = refusalOf(expected);
	let remaining = othersRemaining(expected, ports.slice);
	if (unmet !== undefined && remaining === undefined) {
		return { code: EXIT_CODE.VALIDATION, error: unmet };
	}
	const proved = await ports.prove();
	if (proved.code !== 0) return proved;
	let handed: string | undefined;
	if (remaining === undefined) {
		const answer = await ports.transition('review', checkout);
		handed = refusalOf(answer);
		// Another slice landed or went missing since the preflight.
		remaining = othersRemaining(answer, ports.slice);
	}
	// A slice proved and delivered while the proposal's others are not: the
	// proposal is not for review yet. Only this slice's work is published;
	// the slice that completes the proposal hands it over.
	if (remaining !== undefined) {
		const published = await ports.publish();
		return published.code === 0
			? {
					code: EXIT_CODE.OK,
					data: {
						delivered: 'slice',
						remaining,
						publication: published.data,
						proved: proved.data,
					},
				}
			: published;
	}
	return handed === undefined
		? {
				code: EXIT_CODE.OK,
				data: {
					delivered: 'review',
					publication: unit.publication,
					proved: proved.data,
				},
			}
		: { code: EXIT_CODE.VALIDATION, error: handed };
};
