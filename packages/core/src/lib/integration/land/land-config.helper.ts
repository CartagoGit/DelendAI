/**
 * land-config.helper.ts — the project-specific values a `land` pass reads,
 * taken from the development policy so no project is assumed: the
 * branches, the namespace, the merge method and the required checks come
 * from it; how a project selects sections, names them in its checks and
 * sizes a batch is passed in by whoever wires `land` into the project.
 */
import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import { ownedBatchPrefixes } from '../decisions/namespaces.helper';
import { LAND_BATCH_CAPACITY, LAND_QUEUE_SEGMENT } from './land.constant';
import type { ILandConfig } from './land.interface';

export const landConfigFromPolicy = (
	policy: IResolvedDevelopmentPolicy,
	project: {
		readonly sectionOfCheck?: ILandConfig['sectionOfCheck'];
		readonly batchCapacity?: number;
	} = {},
): ILandConfig => {
	const [batchPrefix = `${LAND_QUEUE_SEGMENT}/`] = ownedBatchPrefixes(
		policy.branches,
	);
	return {
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		batchPrefix,
		withoutChecks: policy.integration.landWithoutChecks,
		mergeMethod: policy.integration.mergeMethod,
		requiredChecks: policy.integration.requiredChecks,
		batchCapacity: project.batchCapacity ?? LAND_BATCH_CAPACITY,
		sectionOfCheck: project.sectionOfCheck ?? (() => undefined),
	};
};
