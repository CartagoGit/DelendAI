/**
 * parity-sampler.ts — random operations through two drivers, and a count
 * of where they part.
 *
 * Each run builds three fresh registries — the primary driver, the shadow
 * driver, and the primary driver again — and feeds all three the same
 * generated sequence. Primary against shadow is driver parity; primary
 * against its own replay is determinism, split into "saw the same inputs"
 * and "made the same thing of them". Pure: the drivers arrive as
 * factories, so the SQLite one never loads here.
 */
import { STATE_ABI_VERSION } from './fingerprint';
import type { IStateGeneration } from './generation';
import { sha256BytesHex } from './hash';
import type {
	IParityDivergence,
	IParityReport,
	IParitySamplerInput,
} from './parity-sampler.interface';
import type { IStateInputSnapshot, IStateProducer } from './producer';
import type { IHydrateInput, IStateRegistry } from './registry';
import type { StateScope } from './scope';
import { asRepositoryInstanceId, asWorktreeId } from './scope';

const PROJECT: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/parity',
		worktreeId: asWorktreeId('wt-parity'),
		cacheRoot: '/parity/.cache',
		docsRoot: '/parity/docs',
	},
};

const SWARM: StateScope = {
	kind: 'swarm',
	locator: {
		repositoryInstanceId: asRepositoryInstanceId('parity'),
		swarmRoot: '/parity/.cache/swarm',
	},
};

const SPEC = { kind: 'file', locator: 'counter.json' } as const;
const PRODUCER_ID = 'parity-counter';
/** How many distinct operations the generator chooses between. */
const OPERATION_KINDS = 6;
/** How many swarm slots the claims are spread over. */
const SLOTS = 3;
/** The range the generated counter values are drawn from. */
const VALUE_RANGE = 1000;

/** mulberry32: small, seeded, and the same on every runtime. */
const seeded = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
};

/** A counter: rebuilt from its input, moved by a `tick`. */
export const parityProducer = (): IStateProducer => ({
	id: PRODUCER_ID,
	abiVersion: STATE_ABI_VERSION,
	producerVersion: 1,
	serves: ['project'],
	inputs: [SPEC],
	rebuild: (ctx) => {
		const text = new TextDecoder().decode(
			ctx.resolved[0]?.content ?? new Uint8Array(),
		);
		return { canonical: { value: text.length === 0 ? 0 : Number(text) } };
	},
	reconcile: (ctx, change) => {
		const base = (ctx.baseProjection?.canonical ?? { value: 0 }) as {
			value: number;
		};
		return {
			canonical: { value: base.value + Number(change.delta ?? 0) },
		};
	},
});

const inputFor = (value: number): IHydrateInput => {
	const bytes = new TextEncoder().encode(String(value));
	const digest = sha256BytesHex(bytes);
	const snapshot: IStateInputSnapshot = {
		fingerprint: {
			abiVersion: STATE_ABI_VERSION,
			producers: [
				{
					id: PRODUCER_ID,
					producerVersion: 1,
					abiVersion: STATE_ABI_VERSION,
					inputs: [{ ...SPEC, digest }],
				},
			],
		},
		contents: new Map([['file|counter.json|', bytes]]),
		declared: [SPEC],
		byProducer: new Map([
			[PRODUCER_ID, [{ spec: SPEC, digest, content: bytes }]],
		]),
	};
	return {
		scope: PROJECT,
		storageIdentity: {
			repositoryInstanceId: 'parity',
			worktreeId: 'wt-parity',
		},
		snapshot,
	};
};

/** One generated operation, applied to one registry. */
const apply = (
	registry: IStateRegistry,
	operation: number,
	value: number,
): void => {
	const active = registry
		.diagnose()
		.find((generation) => generation.status === 'active');
	switch (operation) {
		case 0:
			registry.hydrate(inputFor(value));
			return;
		case 1:
			if (active === undefined) registry.hydrate(inputFor(value));
			else
				registry.incremental(inputFor(value), {
					kind: 'tick',
					delta: 1,
				});
			return;
		case 2:
			if (active === undefined) return;
			registry.acquireProjectLease({
				scope: PROJECT,
				generationId: active.id,
				token: active.projectLeaseToken,
			});
			return;
		case 3: {
			if (active === undefined) return;
			const lease = registry.acquireProjectLease({
				scope: PROJECT,
				generationId: active.id,
				token: active.projectLeaseToken,
			});
			if ('leaseId' in lease) lease.release();
			return;
		}
		case 4: {
			const claim = registry.acquireSwarmClaim({
				scope: SWARM,
				slot: `slot-${String(value % SLOTS)}`,
			});
			claim.renew();
			return;
		}
		default:
			registry.gc(PROJECT);
	}
};

const byId = (registry: IStateRegistry): Map<string, IStateGeneration> =>
	new Map(
		registry.diagnose().map((generation) => [generation.id, generation]),
	);

/** Run the sampler and count what parted. */
export const sampleParity = (input: IParitySamplerInput): IParityReport => {
	const random = seeded(input.seed);
	const divergences: IParityDivergence[] = [];
	let generationsCompared = 0;
	for (let run = 0; run < input.runs; run += 1) {
		const registries = [input.primary, input.shadow, input.primary].map(
			(define) => {
				const registry = define({ clock: () => 0 });
				registry.defineProducer(parityProducer());
				return registry;
			},
		);
		for (let step = 0; step < input.operationsPerRun; step += 1) {
			const operation = Math.floor(random() * OPERATION_KINDS);
			const value = Math.floor(random() * VALUE_RANGE);
			for (const registry of registries)
				apply(registry, operation, value);
		}
		const [primary, shadow, replay] = registries.map(byId);
		if (!primary || !shadow || !replay) continue;
		const ids = new Set([
			...primary.keys(),
			...shadow.keys(),
			...replay.keys(),
		]);
		generationsCompared += ids.size;
		for (const generationId of ids) {
			const mine = primary.get(generationId);
			const theirs = shadow.get(generationId);
			const again = replay.get(generationId);
			if (mine?.canonicalHash !== theirs?.canonicalHash) {
				divergences.push({ kind: 'driver-parity', run, generationId });
			}
			const sameInputs =
				mine !== undefined &&
				again !== undefined &&
				JSON.stringify(mine.fingerprint) ===
					JSON.stringify(again.fingerprint);
			if (!sameInputs) {
				divergences.push({
					kind: 'replay-determinism',
					run,
					generationId,
				});
			} else if (mine.canonicalHash !== again.canonicalHash) {
				divergences.push({
					kind: 'execution-determinism',
					run,
					generationId,
				});
			}
		}
	}
	const count = (kind: IParityDivergence['kind']): number =>
		divergences.filter((each) => each.kind === kind).length;
	return {
		seed: input.seed,
		runs: input.runs,
		operations: input.runs * input.operationsPerRun,
		generationsCompared,
		driverParityDivergences: count('driver-parity'),
		replayDeterminismDivergences: count('replay-determinism'),
		executionDeterminismDivergences: count('execution-determinism'),
		divergences,
	};
};
