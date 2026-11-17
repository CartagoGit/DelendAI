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
				readonly kind?: string | undefined;
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
				...(unit.kind === undefined ? [] : [`--kind=${unit.kind}`]),
				`--slice=${unit.slice}`,
				`--generation=${String(unit.generation)}`,
				...(unit.topic === undefined ? [] : [`--topic=${unit.topic}`]),
			];
};

/** A refusal that only says the proposal already stands past that step. */
const alreadyPast = (reason: string, to: string): boolean =>
	reason.includes('illegal transition') &&
	!reason.includes(`"ready" → "${to}"`);

/**
 * A proposal that already stands in review refuses the transition to
 * review. That step is also what publishes the unit, so a delivery that
 * only logged the refusal left the pull request on its old head.
 */
const alreadyInReview = (answer: unknown): boolean =>
	codeOf(answer) === ALREADY_IN_REVIEW_CODE;

/** The tool's code for a proposal whose other slices have no delivering commit. */
const UNDELIVERED_CODE = 'undelivered-slices';

/** The tool's code for a transition to review of a proposal already in review. */
const ALREADY_IN_REVIEW_CODE = 'already-in-review';

/** The machine code of a refusal, at the top level or in its `error`. */
const codeOf = (answer: unknown): string | undefined => {
	if (!isRecord(answer) || answer.ok !== false) return undefined;
	const detail = isRecord(answer.error) ? answer.error : answer;
	return textOf(detail.code) ?? textOf(answer.code);
};

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

/** The number a pull request URL ends in (`…/pull/12`). */
const NUMBER_OF_URL = /\/pull\/(?<number>\d+)\/?$/u;

/**
 * Where the pull request of a delivery is: its number and URL when the
 * publication answered with one, and otherwise that the publication was
 * pushed and the pull request is pending, with the branch. A delivery
 * that hands the proposal to review publishes apart from this command,
 * so there it is pending; agents could not find their pull request.
 */
export const pullRequestOf = (
	publication: unknown,
	branch: unknown,
	slice = 'all',
): Record<string, unknown> => {
	const answer = pullRequestAnswer(publication, branch);
	// A small proposal is published whole, by the policy's publication rule
	// (`integration.publication`), so its branch says `all` while the unit
	// is its slice: say so rather than let the name read as a lost slice.
	const whole =
		slice !== 'all' &&
		typeof answer.branch === 'string' &&
		/-all-g\d+(?:\/|$)/u.test(answer.branch)
			? {
					slice,
					sliceNote: `the proposal is published whole (policy integration.publication), so the branch says all; this unit's slice is ${slice}`,
				}
			: {};
	return { ...answer, ...whole };
};

const pullRequestAnswer = (
	publication: unknown,
	branch: unknown,
): Record<string, unknown> => {
	const data = isRecord(publication) ? publication : {};
	const request = isRecord(data.pullRequest) ? data.pullRequest : {};
	const url = textOf(request.url);
	if (url !== undefined) {
		const number = NUMBER_OF_URL.exec(url)?.groups?.number;
		return {
			url,
			...(number === undefined ? {} : { number: Number(number) }),
		};
	}
	const where =
		textOf(branch) ??
		textOf(isRecord(data.publication) ? data.publication.ref : undefined);
	return {
		pending: true,
		...(where === undefined ? {} : { branch: where }),
		message: `publication pushed, pull request pending${where === undefined ? '' : `: ${where}`}`,
	};
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
	const proved = await ports.prove();
	if (proved.code !== 0) return proved;
	// `--only` runs gates of the proof and proves nothing: not a delivery.
	if (isRecord(proved.data) && proved.data.partial === true) {
		return {
			code: EXIT_CODE.USAGE,
			error: 'work deliver proves the whole unit: --only is for `work prove`, which never proves the unit.',
		};
	}
	const answer = await ports.transition('review', checkout);
	const handed = refusalOf(answer);
	// A slice proved and delivered while the proposal's others are not:
	// the proposal is not for review yet, and a refusal after the proof
	// would waste it. Only this slice's work is published; the slice that
	// completes the proposal hands it over.
	const remaining = undeliveredSlicesOf(answer);
	if (
		remaining !== undefined &&
		ports.slice !== 'all' &&
		!remaining.includes(ports.slice)
	) {
		const published = await ports.publish();
		return published.code === 0
			? {
					code: EXIT_CODE.OK,
					data: {
						delivered: 'slice',
						remaining,
						publication: published.data,
						pullRequest: pullRequestOf(
							published.data,
							unit.publication,
						),
						proved: proved.data,
					},
				}
			: published;
	}
	// Nothing to transition: the unit's new tip still has to reach its
	// publication, so it is published here and the result says so.
	if (alreadyInReview(answer)) {
		const published = await ports.publish();
		return published.code === 0
			? {
					code: EXIT_CODE.OK,
					data: {
						delivered: 'review',
						republished: true,
						publication: published.data,
						pullRequest: pullRequestOf(
							published.data,
							unit.publication,
							ports.slice,
						),
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
					pullRequest: pullRequestOf(
						undefined,
						unit.publication,
						ports.slice,
					),
					proved: proved.data,
				},
			}
		: { code: EXIT_CODE.VALIDATION, error: handed };
};
