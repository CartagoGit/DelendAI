/**
 * owned-work-ref-parser.ts — one parser for the work refs of every
 * namespace delendai owns in a project, current first.
 *
 * A project that changed `namespacePrefix` still has units under the
 * former one. Each owned namespace gets the same shape after its own
 * prefix, so a unit parses to the same identity wherever it lives.
 */
import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';
import type { IOwnedWorkRefShape } from '../contracts/interfaces/owned-work-ref-shape.interface';
import {
	compileWorkRefParser,
	type IWorkRefParser,
} from '../startup-reconciler/work-ref-identity';
import { WORK_REF_SHAPE } from './profiles.constant';
import {
	ownedNamespaces,
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
} from './owned-ref-prefixes';

type IShapeBranches = Pick<
	IPolicyBranches,
	| 'namespacePrefix'
	| 'formerNamespacePrefixes'
	| 'workRefTemplate'
	| 'workRefPrefix'
	| 'workRefVisibility'
	| 'publicationRefPrefix'
>;

/** `refs/heads/wip/`, `heads/wip/` and `wip/` are the same namespace. */
const bare = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** One owned namespace: its prefixes and the shapes a unit there has. */
interface INamespaceRow {
	readonly index: number;
	readonly namespace: string;
	readonly workPrefix: string;
	readonly publication: string;
	readonly shapes: readonly IOwnedWorkRefShape[];
}

/**
 * Every owned namespace, current first. A unit may carry the current
 * shape or the one units had before a project chose another template
 * (`WORK_REF_SHAPE`): both are read everywhere, the current one first in
 * the current namespace and the earlier one first in a former namespace
 * (f00808 S9).
 */
const namespaceRows = (branches: IShapeBranches): readonly INamespaceRow[] => {
	const { workRefTemplate: template, workRefPrefix: prefix } = branches;
	if (template.length === 0) return [];
	if (prefix.length === 0 || !template.startsWith(prefix)) {
		return [
			{
				index: 0,
				namespace: branches.namespacePrefix,
				workPrefix: prefix,
				publication: branches.publicationRefPrefix,
				shapes: [{ prefix, template, current: true }],
			},
		];
	}
	const shape = template.slice(prefix.length);
	const earlier = shape === WORK_REF_SHAPE ? [] : [WORK_REF_SHAPE];
	const namespaces = ownedNamespaces(branches);
	const publications = ownedPublicationRefPrefixes(branches);
	return ownedWorkRefPrefixes(branches).map((owned, index) => {
		const order = index === 0 ? [shape, ...earlier] : [...earlier, shape];
		return {
			index,
			namespace: namespaces[index] ?? '',
			workPrefix: owned,
			publication: publications[index] ?? '',
			shapes: order.map((each) => ({
				prefix: owned,
				template: `${owned}${each}`,
				current: index === 0 && each === shape,
			})),
		};
	});
};

/** The template and prefix of each owned work shape, current first. */
export const ownedWorkRefShapes = (
	branches: IShapeBranches,
): readonly IOwnedWorkRefShape[] =>
	namespaceRows(branches).flatMap((row) => row.shapes);

/** The shape of `row` that reads `name` (a work branch), else its first. */
const shapeReading = (
	row: INamespaceRow,
	name: string,
): IOwnedWorkRefShape | undefined =>
	row.shapes.find(
		(shape) =>
			compileWorkRefParser(shape.template, shape.prefix)?.parse(
				`refs/heads/${name}`,
			) !== undefined,
	) ?? row.shapes[0];

/** The row whose `pick` prefix `name` starts with, longest first. */
const rowUnder = (
	branches: IShapeBranches,
	name: string,
	pick: (row: INamespaceRow) => string,
): INamespaceRow | undefined =>
	[...namespaceRows(branches)]
		.filter((row) => bare(pick(row)).length > 0)
		.sort((a, b) => bare(pick(b)).length - bare(pick(a)).length)
		.find((row) => name.startsWith(bare(pick(row))));

/** The owned work shape a branch (short or qualified) lives under. */
export const ownedWorkRefShapeOf = (
	branches: IShapeBranches,
	branch: string,
): IOwnedWorkRefShape | undefined => {
	const name = bare(branch);
	const row = rowUnder(branches, name, (each) => each.workPrefix);
	return row === undefined ? undefined : shapeReading(row, name);
};

/**
 * The work shape a publication mirrors: a publication under a namespace's
 * publication prefix publishes a unit of that namespace.
 */
export const workShapeOfPublication = (
	branches: IShapeBranches,
	branch: string,
):
	| { readonly publication: string; readonly shape: IOwnedWorkRefShape }
	| undefined => {
	const row = rowUnder(branches, branch, (each) => each.publication);
	if (row === undefined) return undefined;
	const publication = bare(row.publication);
	const asWork = `${bare(row.workPrefix)}${branch.slice(publication.length)}`;
	const shape = shapeReading(row, asWork);
	return shape === undefined ? undefined : { publication, shape };
};

/**
 * A parser over every owned work namespace: it answers with the first
 * namespace whose shape matches. `namespaces` lists each for a scan.
 */
export const compileOwnedWorkRefParser = (
	branches: IShapeBranches,
	options?: Parameters<typeof compileWorkRefParser>[2],
):
	| (IWorkRefParser & { readonly namespaces: readonly string[] })
	| undefined => {
	const parsers = ownedWorkRefShapes(branches)
		.map((shape) =>
			compileWorkRefParser(shape.template, shape.prefix, options),
		)
		.filter((parser): parser is IWorkRefParser => parser !== undefined);
	const [first] = parsers;
	if (first === undefined) return undefined;
	return {
		...first,
		namespaces: parsers.map((parser) => parser.namespace),
		parse: (refName) => {
			for (const parser of parsers) {
				const identity = parser.parse(refName);
				if (identity !== undefined) return identity;
			}
			return undefined;
		},
	};
};

/**
 * The branch settings as the namespace and shape of `ref` have them: a
 * unit under a former namespace, or in an earlier shape, is read, retired
 * and published as it is, never moved (f00808). The settings unchanged for
 * a unit of the current namespace and shape, or for a ref under none.
 */
export const branchesForRef = <T extends IShapeBranches>(
	branches: T,
	ref: string,
): T => {
	const name = bare(ref);
	const work = rowUnder(branches, name, (each) => each.workPrefix);
	const row = work ?? rowUnder(branches, name, (each) => each.publication);
	if (row === undefined) return branches;
	const asWork =
		work !== undefined
			? name
			: `${bare(row.workPrefix)}${name.slice(bare(row.publication).length)}`;
	const shape = shapeReading(row, asWork);
	if (shape === undefined || shape.current) return branches;
	return {
		...branches,
		namespacePrefix: row.namespace,
		workRefPrefix: row.workPrefix,
		workRefTemplate: shape.template,
		publicationRefPrefix: row.publication,
	};
};

/** The policy as the namespace of the unit at `ref` has it (f00808). */
export const unitPolicy = <P extends { readonly branches: IShapeBranches }>(
	policy: P,
	ref: string,
): P => {
	const branches = branchesForRef(policy.branches, ref);
	return branches === policy.branches ? policy : { ...policy, branches };
};
