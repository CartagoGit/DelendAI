/**
 * memo-derivation-engine.service.ts — an `IDerivationEngine` that derives a value
 * once per input fingerprint and serves it again after that, kept in an
 * artifact store when one is given, so a restart does not derive it anew.
 */
import type {
	IArtifactKey,
	IArtifactRecord,
	IArtifactStore,
} from './artifact-store.interface';
import type {
	IDerivation,
	IDerivationEngine,
	IDerivationInput,
} from './derivation-engine.interface';
import { canonicalStateHash, type CanonicalJsonValue } from './hash';
import type { StateScope } from './scope';

export const createMemoDerivationEngine = (input: {
	/** Where the derived values are kept; in memory only without one. */
	readonly store?: IArtifactStore | undefined;
	/** The scope of a derivation that has no input to take it from. */
	readonly scope: StateScope;
	readonly now?: () => number;
	readonly reconciledCommitSha?: string;
}): IDerivationEngine => {
	const now = input.now ?? Date.now;
	const registry = new Map<string, IDerivation<unknown, unknown>>();
	const memory = new Map<string, IArtifactRecord<unknown>>();
	return {
		register<TIn, TOut>(derivation: IDerivation<TIn, TOut>): void {
			registry.set(
				derivation.name,
				derivation as IDerivation<unknown, unknown>,
			);
		},
		async apply<TIn, TOut>(
			name: string,
			derivationInput: IDerivationInput<TIn>,
		): Promise<IArtifactRecord<TOut>> {
			const derivation = registry.get(name) as
				| IDerivation<TIn, TOut>
				| undefined;
			if (derivation === undefined) {
				throw new Error(`Unknown derivation: ${name}`);
			}
			const key: IArtifactKey = {
				scope: derivationInput.inputs[0]?.key.scope ?? input.scope,
				kind: 'fingerprint',
				id: `${name}:${derivation.fingerprint(derivationInput)}`,
			};
			// The scope is part of what was derived: one id under two scopes
			// is two values, not the first one served twice.
			const memoKey = canonicalStateHash({
				scope: key.scope,
				id: key.id,
			} as unknown as CanonicalJsonValue);
			const remembered =
				memory.get(memoKey) ??
				(await input.store?.get<TOut>(key)) ??
				undefined;
			if (remembered !== undefined) {
				memory.set(memoKey, remembered);
				return remembered as IArtifactRecord<TOut>;
			}
			const value = await derivation.derive(derivationInput);
			const at = now();
			const record: IArtifactRecord<TOut> =
				input.store === undefined
					? {
							key,
							value,
							contentHash: canonicalStateHash(
								value as unknown as CanonicalJsonValue,
							),
							createdAt: at,
							updatedAt: at,
							reconciledCommitSha:
								input.reconciledCommitSha ?? '',
						}
					: await input.store.put(key, value);
			memory.set(memoKey, record);
			return record;
		},
	};
};
