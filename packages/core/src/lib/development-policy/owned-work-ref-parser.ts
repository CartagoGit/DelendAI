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
import {
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

/** The template and prefix of each owned work namespace, current first. */
export const ownedWorkRefShapes = (
	branches: IShapeBranches,
): readonly IOwnedWorkRefShape[] => {
	const { workRefTemplate: template, workRefPrefix: prefix } = branches;
	if (template.length === 0) return [];
	if (prefix.length === 0 || !template.startsWith(prefix)) {
		return [{ prefix, template, current: true }];
	}
	const shape = template.slice(prefix.length);
	return ownedWorkRefPrefixes(branches).map((owned, index) => ({
		prefix: owned,
		template: `${owned}${shape}`,
		current: index === 0,
	}));
};

/** `refs/heads/wip/`, `heads/wip/` and `wip/` are the same namespace. */
const bare = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The owned work shape a branch (short or qualified) lives under. */
export const ownedWorkRefShapeOf = (
	branches: IShapeBranches,
	branch: string,
): IOwnedWorkRefShape | undefined => {
	const name = bare(branch);
	return [...ownedWorkRefShapes(branches)]
		.sort((a, b) => b.prefix.length - a.prefix.length)
		.find((shape) => {
			const prefix = bare(shape.prefix);
			return prefix.length > 0 && name.startsWith(prefix);
		});
};

/**
 * The work prefix a publication mirrors: a publication under the N-th
 * owned publication prefix publishes a unit under the N-th work prefix.
 */
export const workShapeOfPublication = (
	branches: IShapeBranches,
	branch: string,
):
	| { readonly publication: string; readonly shape: IOwnedWorkRefShape }
	| undefined => {
	const shapes = ownedWorkRefShapes(branches);
	const publications = ownedPublicationRefPrefixes(branches);
	const order = publications
		.map((publication, index) => ({
			publication: bare(publication),
			index,
		}))
		.filter(({ publication }) => publication.length > 0)
		.sort((a, b) => b.publication.length - a.publication.length);
	const found = order.find(({ publication }) =>
		branch.startsWith(publication),
	);
	const shape = found === undefined ? undefined : shapes[found.index];
	return found === undefined || shape === undefined
		? undefined
		: { publication: found.publication, shape };
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
