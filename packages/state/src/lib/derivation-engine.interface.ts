import type { IArtifactRecord } from './artifact-store.interface';

export interface IDerivationInput<TIn> {
	readonly inputs: readonly IArtifactRecord<TIn>[];
	readonly fingerprint: string;
}

export interface IDerivation<TIn, TOut> {
	readonly name: string;
	readonly derive: (input: IDerivationInput<TIn>) => Promise<TOut>;
	readonly fingerprint: (input: IDerivationInput<TIn>) => string;
}

export interface IDerivationEngine {
	register<TIn, TOut>(d: IDerivation<TIn, TOut>): void;
	apply<TIn, TOut>(
		name: string,
		input: IDerivationInput<TIn>,
	): Promise<IArtifactRecord<TOut>>;
}
