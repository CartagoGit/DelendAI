/**
 * owned-evidence.helper.ts — what a boot reads from every owned namespace
 * (f00808): retired tips and publications of a former namespace still hold
 * the checkpoint of a unit whose work ref is gone.
 */
import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';
import {
	ownedNamespaces,
	ownedPublicationRefPrefixes,
} from '../integration/decisions/namespaces.helper';
import type { IStartupGitSeam } from './seams.interface';

type IBranches = Pick<
	IPolicyBranches,
	| 'integration'
	| 'namespacePrefix'
	| 'formerNamespacePrefixes'
	| 'workRefPrefix'
	| 'workRefVisibility'
	| 'publicationRefPrefix'
>;

/** The commits the forge keeps as retired work, under every owned namespace. */
export const ownedRetiredTips = async (
	git: IStartupGitSeam,
	branches: IBranches,
): Promise<readonly string[]> =>
	(
		await Promise.all(
			ownedNamespaces(branches).map(
				async (namespace) =>
					(await git.listRetiredTips?.(
						namespace,
						branches.integration,
					)) ?? [],
			),
		)
	).flat();

/** The tips of every owned namespace's publications. */
export const ownedPublicationTips = async (
	git: IStartupGitSeam,
	branches: IBranches,
): Promise<readonly string[]> =>
	(
		await Promise.all(
			ownedPublicationRefPrefixes(branches)
				.filter((prefix) => prefix.length > 0)
				.map((prefix) => git.listRefs(prefix)),
		)
	)
		.flat()
		.map((ref) => ref.sha);
