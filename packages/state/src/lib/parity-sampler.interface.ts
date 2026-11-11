/**
 * parity-sampler.interface.ts
 *
 * What the parity sampler is given and what it reports. Three kinds of
 * divergence are counted apart, because each names a different culprit:
 *
 *   - driver parity: the two drivers disagree on a generation's canonical
 *     hash — a bug in a driver's serialisation, validation or fencing;
 *   - replay determinism: two fresh registries of the SAME driver, fed the
 *     same operations, did not see the same inputs (their generations
 *     carry different input fingerprints, or are not the same set);
 *   - execution determinism: they saw the same inputs and still produced
 *     different canonical hashes — a producer that is not a function of
 *     its inputs.
 */
import type { IStateRegistry, IStateRegistryOptions } from './registry';

/** How the sampler builds a registry of one driver. */
export type IParityRegistryFactory = (
	options: IStateRegistryOptions,
) => IStateRegistry;

export type IParityDivergenceKind =
	| 'driver-parity'
	| 'replay-determinism'
	| 'execution-determinism';

export interface IParitySamplerInput {
	/** Independent sequences; each starts from fresh registries. */
	readonly runs: number;
	/** Operations per sequence. */
	readonly operationsPerRun: number;
	/** The same seed yields the same sequences. */
	readonly seed: number;
	readonly primary: IParityRegistryFactory;
	readonly shadow: IParityRegistryFactory;
}

export interface IParityDivergence {
	readonly kind: IParityDivergenceKind;
	readonly run: number;
	readonly generationId: string;
}

export interface IParityReport {
	readonly seed: number;
	readonly runs: number;
	readonly operations: number;
	readonly generationsCompared: number;
	readonly driverParityDivergences: number;
	readonly replayDeterminismDivergences: number;
	readonly executionDeterminismDivergences: number;
	readonly divergences: readonly IParityDivergence[];
}
