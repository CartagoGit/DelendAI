/**
 * work-ref-placeholders.ts — the one reader of a work-ref template's
 * placeholders, and the one rule for a unit's kind (f00644).
 *
 * The placeholder list used to be spelled as a regex in four modules; a
 * placeholder added to the shape would have been silently ignored by
 * whichever copy was not updated.
 */
import {
	DEFAULT_WORK_KIND,
	HOST_APPLICATION_IDS,
	WORK_KINDS,
	WORK_REF_PLACEHOLDERS,
} from './profiles.constant';
import type { IWorkScope } from '../contracts/interfaces/work-scope.interface';

export type { IWorkScope } from '../contracts/interfaces/work-scope.interface';

/**
 * A fresh matcher for `${placeholder}` in a template. Fresh on every
 * call because it is global: a shared instance carries `lastIndex` from
 * one caller into the next.
 */
export const workRefPlaceholderPattern = (): RegExp =>
	new RegExp(`\\$\\{(${WORK_REF_PLACEHOLDERS.join('|')})\\}`, 'gu');

/** Whether `value` is a kind of work the vocabulary names. */
export const isWorkKind = (value: string): boolean =>
	(WORK_KINDS as readonly string[]).includes(value);

/** The slices reviewers worked under before a ref named its kind. */
const LEGACY_REVIEW_SLICES: ReadonlySet<string> = new Set(['review', 'close']);

/**
 * The kind of a unit whose ref predates the kind segment: a review round
 * went by its slice name, everything else was implementation.
 */
export const legacyWorkKind = (slice: string): string =>
	LEGACY_REVIEW_SLICES.has(slice.toLowerCase())
		? 'review'
		: DEFAULT_WORK_KIND;

/**
 * The kinds of work an agent id spells out, as whole dash-separated
 * words. An agent id names who works (the model), not what it is doing:
 * `github-copilot-review-20260926` put the task where the ref's kind
 * belongs, and the ref then read as an agent nobody could recognise.
 */
export const kindsInAgentId = (agent: string): readonly string[] =>
	agent
		.toLowerCase()
		.split(/[-_.]/u)
		.filter((word) => isWorkKind(word) || LEGACY_REVIEW_SLICES.has(word));

/** Whether `agent` names the program it runs in rather than a model. */
export const isHostApplicationId = (agent: string): boolean =>
	HOST_APPLICATION_IDS.includes(agent.trim().toLowerCase());

/**
 * How many path components a work ref carries after its namespace, read
 * from the policy's template: everything from the first component that
 * names a placeholder. A publication ref is the same shape under the
 * publication prefix, so this is also what a canonical one must have.
 * `0` when the template is empty (a profile that commits directly).
 */
export const workRefTailSegments = (template: string): number => {
	const segments = template.split('/').filter((part) => part.length > 0);
	const firstPlaceholder = segments.findIndex((part) =>
		workRefPlaceholderPattern().test(part),
	);
	return firstPlaceholder === -1 ? 0 : segments.length - firstPlaceholder;
};

/**
 * A proposal id as a scope names it (`x01003`), the review batch, or the
 * proposal a create unit has not been given an id for yet (`new`).
 */
const PROPOSAL_TOKEN = /^(?:[a-z]\d+|batch|new)$/u;
/** A slice id as a scope names it (`S2`, `S9b`), or `all` for the whole proposal. */
const SLICE_TOKEN = /^(?:S\d+[a-z]*|all)$/u;
const GENERATION_SUFFIX = /-G(\d+)$/u;

/** Whether `value` is a slice id a scope can carry. */
export const isScopeSlice = (value: string): boolean => SLICE_TOKEN.test(value);

/** Whether `value` is a proposal id a scope can carry. */
export const isScopeProposal = (value: string): boolean =>
	PROPOSAL_TOKEN.test(value);

/**
 * Render a scope: `x01003`, `x01003-S2`, `x01003-S1-S3`, `x01003-S1+S4`,
 * `x01004+x01016`, with `-G{n}` (uppercase) only from generation 2. Only
 * `-` and `+` join parts, so the result is a legal ref component.
 */
export const renderWorkScope = (scope: IWorkScope): string => {
	const head = scope.ids.join('+');
	const slices =
		scope.slices.length === 0
			? ''
			: `-${scope.slices.join(scope.range ? '-' : '+')}`;
	const generation = scope.generation > 1 ? `-G${scope.generation}` : '';
	return `${head}${slices}${generation}`;
};

/** Read a scope component back, or `undefined` when it is not the grammar. */
export const parseWorkScope = (value: string): IWorkScope | undefined => {
	const found = GENERATION_SUFFIX.exec(value);
	const generation = found?.[1] === undefined ? 1 : Number(found[1]);
	const body = found === null ? value : value.slice(0, found.index);
	const tokens = body.split('+');
	if (tokens.every((token) => PROPOSAL_TOKEN.test(token))) {
		return { ids: tokens, slices: [], range: false, generation };
	}
	const [first, ...rest] = tokens;
	if (first === undefined || !rest.every((t) => SLICE_TOKEN.test(t))) {
		return undefined;
	}
	const [proposal, ...firstSlices] = first.split('-');
	if (
		proposal === undefined ||
		!PROPOSAL_TOKEN.test(proposal) ||
		firstSlices.length === 0 ||
		firstSlices.length > 2 ||
		!firstSlices.every((t) => SLICE_TOKEN.test(t))
	) {
		return undefined;
	}
	const range = firstSlices.length === 2;
	if (range && rest.length > 0) return undefined;
	return {
		ids: [proposal],
		slices: [...firstSlices, ...rest],
		range,
		generation,
	};
};

/**
 * The scope component for a unit named by proposal, slice and generation.
 * A slice that is not a slice id (`review`, a free word) keeps its text,
 * sanitised by the caller, so an unusual name degrades instead of failing.
 */
export const scopeOfUnit = (
	proposal: string,
	slice: string,
	generation: number,
): string => {
	if (isScopeProposal(proposal) && isScopeSlice(slice)) {
		return renderWorkScope({
			ids: [proposal],
			slices: [slice],
			range: false,
			generation,
		});
	}
	return `${proposal}-${slice}${generation > 1 ? `-G${generation}` : ''}`;
};
