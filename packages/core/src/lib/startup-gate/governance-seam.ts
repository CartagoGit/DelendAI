/**
 * governance-seam.ts — lets a boot read the forge's LIVE governance, so
 * "develop is protected" is something the workspace observed rather than
 * something a config file asserts.
 *
 * WHY the reconciler treats an unreadable forge as a blocker rather than
 * a pass: the whole point of the governance phase is to catch a live
 * repository that has drifted from the policy. A boot that cannot reach
 * the forge has learned nothing, and "I could not check" is not "it is
 * fine". Whether that blocks READY is the operator's call, expressed as
 * `governance.failClosedOnUnverifiable`; this seam's only job is to tell
 * the truth about what it managed to read.
 *
 * WHY `undefined` and not a thrown error: an offline laptop, an expired
 * credential and a rate-limited API are ordinary conditions, not faults.
 * They come back as "not read", the phase records
 * `governance.unverifiable`, and nothing is inferred from the silence.
 *
 * SECURITY: no token value passes through this file. The GitHub adapter
 * shells out to `gh`, which picks the credential up from the ambient
 * environment itself; delendai only ever observes WHETHER a variable is
 * exported (`credentialSeam.available`), never its contents. Nothing here
 * logs, stores, serialises or forwards a credential.
 */

import {
	createGithubForgeAdapter,
	type IDesiredForgeState,
	type IForgeRepositoryRef,
	type ILiveForgeState,
} from '../forge-governance/index';
import type { IStartupGovernanceSeam } from './../startup-reconciler/seams.interface';

import type { IGovernanceSeamOptions } from './governance-seam.interface';

export type { IGovernanceSeamOptions } from './governance-seam.interface';

/** Every branch the desired state has an opinion about. */
const branchesOf = (desired: IDesiredForgeState): readonly string[] =>
	desired.branches.map((rule) => rule.branch);

/**
 * A read-only governance seam.
 *
 * Deliberately built from an adapter with mutations DISABLED. A boot
 * inspects; it never silently repairs a branch rule, because a startup
 * that quietly changed the protection of a shared branch would be the
 * most surprising thing this system could do.
 */
export const createStartupGovernanceSeam = (
	options: IGovernanceSeamOptions = {},
): IStartupGovernanceSeam & { readonly credentialDescription: string } => {
	const adapter = createGithubForgeAdapter({
		...(options.env !== undefined ? { env: options.env } : {}),
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		mutationsEnabled: false,
	});

	return {
		// Safe to surface in a boot report: it names the mechanism, never
		// the material. `tokenVariablePresent: false` does NOT mean
		// unauthenticated — `gh` may hold its own login — which is why a
		// failed read is reported as "not read", never as "no credential".
		credentialDescription: adapter.credentialSeam.description,
		readLiveState: async (request: {
			readonly target: IForgeRepositoryRef;
			readonly desired: IDesiredForgeState;
		}): Promise<ILiveForgeState | undefined> => {
			try {
				const live = await adapter.readLiveState({
					target: request.target,
					branches: branchesOf(request.desired),
				});
				// An adapter that read nothing at all did not observe a
				// repository with no settings — it failed to observe. The
				// difference matters: the first is a drift report, the
				// second is silence.
				return Object.keys(live.properties).length === 0
					? undefined
					: live;
			} catch {
				return undefined;
			}
		},
	};
};
