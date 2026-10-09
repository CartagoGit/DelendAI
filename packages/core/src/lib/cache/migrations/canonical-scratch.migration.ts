import {
	CANONICAL_SCRATCH_PATHS,
	CANONICAL_SCRATCH_STEP_ID,
} from '../../contracts/constants/cache-layout-migration.constant';
import type { ICacheLayoutMigration } from '../../contracts/interfaces/cache-layout.interface';

/**
 * Epoch 1 -> 2: scratch directories took canonical, undotted names inside
 * the cache. Ephemeral, so a leftover is moved when the canonical name is
 * free and otherwise left alone; nothing is deleted.
 */
export const createCanonicalScratchMigration = (): ICacheLayoutMigration => ({
	id: CANONICAL_SCRATCH_STEP_ID,
	fromEpoch: 1,
	toEpoch: 2,
	detect: async (ctx) => {
		for (const [from] of CANONICAL_SCRATCH_PATHS)
			if (await ctx.helpers.pathExists(from)) return true;
		return false;
	},
	plan: async (ctx) => {
		const steps = [];
		for (const [from, to] of CANONICAL_SCRATCH_PATHS)
			if (await ctx.helpers.pathExists(from))
				steps.push({
					kind: 'move-scratch',
					detail: `${from} -> ${to}`,
				});
		return steps;
	},
	apply: async (ctx) => {
		for (const [from, to] of CANONICAL_SCRATCH_PATHS)
			await ctx.helpers.moveIfDestinationMissing(from, to);
	},
});
