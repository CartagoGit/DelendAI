/**
 * land-role.helper.ts — what each role of a pass may never do, enforced on
 * the adapters it is given rather than trusted to every path: the host's
 * pass never merges, and where the host opens the batches the integrator
 * never pushes one.
 */
import type { ILandDeps } from './land.interface';

const refuse = (what: string): never => {
	throw new Error(`land: ${what}`);
};

/** `deps` with the calls its role may not make refused. */
export const guardedFor = (deps: ILandDeps): ILandDeps => {
	const role = deps.role ?? 'integrate';
	if (role === 'open-batches')
		return {
			...deps,
			forge: {
				...deps.forge,
				merge: () => refuse('the host role never merges'),
			},
		};
	if (deps.config.batchOpener !== 'integrator')
		return {
			...deps,
			git: {
				...deps.git,
				buildBatch: () =>
					refuse(
						'the integrator pushes no batch: the batch opener is the host or nobody',
					),
			},
		};
	return deps;
};
