/**
 * harness.ts — one assembled engine over a real clone, a real server, a
 * fake forge and an in-memory state model.
 *
 * The specs are about the CYCLE, not about wiring, so the wiring lives
 * here once. `checkpoint()` writes a genuine WIP ref through the WIP
 * engine — never a hand-made commit — because the integration engine
 * replays those refs with `rebaseWipOntoNewBase`, and a ref without the
 * engine's scope trailers is not the thing under test.
 */

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import {
	createIntegrationEngine,
	type IIntegrationCandidate,
	type IIntegrationEngine,
	type IIntegrationRepositoryRef,
} from '@delendai/core/lib/integration-engine/index';
import {
	anchorFromPolicy,
	createWipEngine,
	type IWipEngine,
} from '@delendai/core/lib/wip-engine/index';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';

import { createFakeForge, type IFakeForge } from './fake-forge';
import { createFakeState, type IFakeState } from './fake-state';
import {
	createIntegrationTestRepo,
	INTEGRATION_BRANCH,
	REMOTE,
	type IIntegrationTestRepo,
} from './integration-repo';

/** The repository identity every spec integrates into. */
export const TARGET: IIntegrationRepositoryRef = {
	forge: 'fake',
	owner: 'acme',
	repository: 'widgets',
	remote: REMOTE,
};

/** The policy under test: shared checkout, WIP refs, pull requests. */
export const prPolicy = (): IResolvedDevelopmentPolicy =>
	expandProfile('shared-checkout-pr');

/** What one spec gets. */
export interface IHarness {
	readonly repo: IIntegrationTestRepo;
	readonly forge: IFakeForge;
	readonly state: IFakeState;
	readonly engine: IIntegrationEngine;
	readonly wip: IWipEngine;
	/** Write a real WIP checkpoint and describe it as a candidate. */
	readonly checkpoint: (args: {
		readonly agent: string;
		readonly path: string;
		readonly content: string;
		readonly baseSha?: string;
		readonly generation?: number;
		readonly slice?: string;
	}) => Promise<IIntegrationCandidate>;
	/** Bring the clone's view of the server up to date. */
	readonly fetchIntegration: () => void;
	readonly cleanup: () => void;
}

export const createHarness = async (): Promise<IHarness> => {
	const repo = createIntegrationTestRepo();
	const forge = createFakeForge(repo);
	const state = createFakeState();
	// The harness runs the engine under the same policy production uses,
	// so the anchor is stated rather than waived.
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { integration: INTEGRATION_BRANCH },
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});
	const wip = (await createWipEngine(
		repo.dir,
		anchorFromPolicy(policy),
	)) as IWipEngine;
	const engine = (await createIntegrationEngine({
		cwd: repo.dir,
		policy,
		forge: forge.forge,
		state: state.port,
		clock: () => 1_700_000_000_000,
	})) as IIntegrationEngine;

	const fetchIntegration = (): void => {
		repo.git(
			'fetch',
			'--quiet',
			REMOTE,
			`+refs/heads/${INTEGRATION_BRANCH}:refs/remotes/${REMOTE}/${INTEGRATION_BRANCH}`,
		);
	};

	const checkpoint: IHarness['checkpoint'] = async (args) => {
		const generation = args.generation ?? 1;
		const slice = args.slice ?? 's1';
		const baseSha = args.baseSha ?? repo.serverHead();
		const ref = `refs/wip/${args.agent}/p1-${slice}-g${String(generation)}`;
		repo.write(args.path, args.content);
		const result = await wip.createOrUpdateWipRef({
			baseSha,
			paths: [args.path],
			ref,
			message: `wip: ${args.agent} ${slice} g${String(generation)}`,
		});
		if (result.status !== 'created' && result.status !== 'unchanged') {
			throw new Error(
				`checkpoint failed: ${result.reason ?? result.status}`,
			);
		}
		return {
			repository: TARGET,
			workUnitUid: `fake:acme/widgets#p1/${slice}`,
			proposalUid: 'p1',
			sliceUid: slice,
			generation,
			agentId: args.agent,
			machineId: 'machine-1',
			wipRef: ref,
			wipHeadSha: result.commit,
			baseIntegrationSha: baseSha,
			fileScope: [args.path],
			patchDigest: result.patchDigest,
			title: `${args.agent} ${slice} g${String(generation)}`,
		};
	};

	return {
		repo,
		forge,
		state,
		engine,
		wip,
		checkpoint,
		fetchIntegration,
		cleanup: repo.cleanup,
	};
};
