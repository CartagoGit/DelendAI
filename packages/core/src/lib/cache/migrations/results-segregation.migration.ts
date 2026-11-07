import {
	RESULTS_SEGREGATION_PATHS,
	RESULTS_SEGREGATION_STEP_ID,
} from '../../contracts/constants/cache-layout-migration.constant';
import type {
	ICacheLayoutHelpers,
	ICacheLayoutMigration,
	ICacheLayoutMigrationContext,
} from '../../contracts/interfaces/cache-layout.interface';

/**
 * Move one legacy directory into its place under `results/`, entry by
 * entry. An entry whose destination already exists stays where it is: both
 * copies survive and the leftover is reported, because deciding which
 * history wins is the owner plugin's call, never the lifecycle's.
 */
export const mergeDirectoryInto = async (
	helpers: ICacheLayoutHelpers,
	fromRel: string,
	toRel: string,
): Promise<readonly string[]> => {
	const left: string[] = [];
	if (!(await helpers.pathExists(toRel))) {
		const outcome = await helpers.moveIfDestinationMissing(fromRel, toRel);
		return outcome === 'moved' ? [] : [fromRel];
	}
	for (const name of await helpers.listDirectory(fromRel)) {
		const outcome = await helpers.moveIfDestinationMissing(
			`${fromRel}/${name}`,
			`${toRel}/${name}`,
		);
		if (outcome === 'skipped-conflict') left.push(`${fromRel}/${name}`);
	}
	await helpers.removeEmptyDirectory(fromRel);
	return left;
};

const legacyPresent = async (
	ctx: ICacheLayoutMigrationContext,
): Promise<readonly (readonly [string, string])[]> => {
	const present: (readonly [string, string])[] = [];
	for (const pair of RESULTS_SEGREGATION_PATHS)
		if (await ctx.helpers.pathExists(pair[0])) present.push(pair);
	return present;
};

/**
 * Epoch 2 -> 3: `logs`, `logs-errors`, `memory` and `usage-tracking` moved
 * under `results/`. These are records, so nothing here is ever deleted:
 * the known directories are moved or merged and nothing else is looked at.
 */
export const createResultsSegregationMigration = (): ICacheLayoutMigration => ({
	id: RESULTS_SEGREGATION_STEP_ID,
	fromEpoch: 2,
	toEpoch: 3,
	detect: async (ctx) => (await legacyPresent(ctx)).length > 0,
	plan: async (ctx) =>
		(await legacyPresent(ctx)).map(([from, to]) => ({
			kind: 'move-records',
			detail: `${from} -> ${to}`,
		})),
	apply: async (ctx) => {
		for (const [from, to] of await legacyPresent(ctx))
			await mergeDirectoryInto(ctx.helpers, from, to);
	},
});
