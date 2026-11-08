/**
 * model-outcomes.migration.ts — epoch 5 -> 6: `auto-agent-selector`'s
 * calibration log becomes the shared model-outcome store.
 *
 * Its lines keep their shape and are read as outcomes by the store, so
 * the file moves as it is. A store already present is a conflict: both
 * files stay and the leftover is reported, as every records move does.
 */
import { MODEL_OUTCOMES_STEP_ID } from '../../contracts/constants/cache-layout-migration.constant';
import {
	LEGACY_CALIBRATION_RELATIVE_PATH,
	MODEL_OUTCOMES_RELATIVE_PATH,
} from '../../contracts/constants/model-outcomes.constant';
import type { ICacheLayoutMigration } from '../../contracts/interfaces/cache-layout.interface';

export const createModelOutcomesMigration = (): ICacheLayoutMigration => ({
	id: MODEL_OUTCOMES_STEP_ID,
	fromEpoch: 5,
	toEpoch: 6,
	detect: (ctx) => ctx.helpers.pathExists(LEGACY_CALIBRATION_RELATIVE_PATH),
	plan: async (ctx) =>
		(await ctx.helpers.pathExists(LEGACY_CALIBRATION_RELATIVE_PATH))
			? [
					{
						kind: 'move-records',
						detail: `${LEGACY_CALIBRATION_RELATIVE_PATH} -> ${MODEL_OUTCOMES_RELATIVE_PATH}`,
					},
				]
			: [],
	apply: async (ctx) => {
		if (!(await ctx.helpers.pathExists(LEGACY_CALIBRATION_RELATIVE_PATH)))
			return;
		await ctx.helpers.moveIfDestinationMissing(
			LEGACY_CALIBRATION_RELATIVE_PATH,
			MODEL_OUTCOMES_RELATIVE_PATH,
		);
	},
});
