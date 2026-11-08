/**
 * plan-blocks.ts — a plan's `contains:` and `closureGate:` frontmatter
 * blocks, read into their typed shape (f00764).
 */
import type { IYamlValue } from './frontmatter-parser';
import type {
	IPlanChild,
	IPlanClosureGate,
	IPlanContains,
	IProposalFrontmatter,
} from './proposal-document';

/** One `contains.*` entry: a bare id, or `{ id, kind?, required?, title? }`. */
const planChildOf = (entry: IYamlValue): IPlanChild | undefined => {
	if (typeof entry === 'string' || typeof entry === 'number') {
		const id = String(entry).trim();
		return id.length === 0 ? undefined : { id };
	}
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
		return undefined;
	const fields = entry as Record<string, IYamlValue>;
	const id = String(fields.id ?? '').trim();
	if (id.length === 0) return undefined;
	return {
		id,
		...(typeof fields.kind === 'string' ? { kind: fields.kind } : {}),
		...(typeof fields.required === 'boolean'
			? { required: fields.required }
			: {}),
		...(typeof fields.title === 'string' ? { title: fields.title } : {}),
	};
};

/**
 * A plan's `contains:` and `closureGate:` blocks. Left out, a plan's
 * closure saw no contained proposal, sub-plan or audit at all and could
 * close with every child still open (found by f00764).
 */
export const planBlocks = (
	parsed: Readonly<Record<string, IYamlValue>>,
): Pick<IProposalFrontmatter, 'contains' | 'closureGate'> => {
	const contains =
		parsed.contains !== null &&
		typeof parsed.contains === 'object' &&
		!Array.isArray(parsed.contains)
			? (parsed.contains as Record<string, IYamlValue>)
			: undefined;
	const list = (key: string): readonly IPlanChild[] | undefined => {
		const raw = contains?.[key];
		return Array.isArray(raw)
			? raw.flatMap((entry) => planChildOf(entry) ?? [])
			: undefined;
	};
	const lists = Object.fromEntries(
		(['proposals', 'plans', 'slices', 'audits'] as const).flatMap((key) => {
			const children = list(key);
			return children === undefined ? [] : [[key, children]];
		}),
	) as IPlanContains;
	const gate =
		parsed.closureGate !== null &&
		typeof parsed.closureGate === 'object' &&
		!Array.isArray(parsed.closureGate)
			? (parsed.closureGate as Record<string, IYamlValue>)
			: undefined;
	const flag = (key: keyof IPlanClosureGate) =>
		typeof gate?.[key] === 'boolean' ? { [key]: gate[key] as boolean } : {};
	return {
		...(contains === undefined ? {} : { contains: lists }),
		...(gate === undefined
			? {}
			: {
					closureGate: {
						...flag('requirePeerReview'),
						...flag('requireAllSlicesDone'),
						...flag('requireAllChildrenDone'),
					},
				}),
	};
};
