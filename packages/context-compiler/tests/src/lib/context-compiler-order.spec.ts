/**
 * context-compiler-order.spec.ts — a manifest diff orders its refs by
 * code units, so refs the locale calls equal still hash the same.
 */
import { describe, expect, it } from 'vitest';

import type {
	IArtifactRecord,
	IArtifactStore,
	IDerivation,
	IDerivationInput,
	IDerivationEngine,
} from '@delendai/state';
import { canonicalStateHash } from '@delendai/state';
import { fakePartial } from '@delendai/test-kit';

import { createContextCompiler } from '../../../src/lib/context-compiler';
import type {
	IContextManifest,
	IContextRef,
} from '../../../src/lib/context-manifest';

/** Runs each derivation directly: the order under test is not its concern. */
const directEngine = (): IDerivationEngine => {
	const derive = new Map<
		string,
		(input: IDerivationInput<unknown>) => Promise<unknown>
	>();
	return {
		register: <TIn, TOut>(derivation: IDerivation<TIn, TOut>) => {
			derive.set(derivation.name, async (input) =>
				derivation.derive(input as IDerivationInput<TIn>),
			);
		},
		apply: async <TIn, TOut>(name: string, input: IDerivationInput<TIn>) =>
			fakePartial<IArtifactRecord<TOut>>({
				value: (await derive.get(name)?.(input)) as TOut,
				createdAt: 1,
			}),
	};
};

// Canonically equivalent: `localeCompare` answers 0 for the pair.
const NFC = '\u00e9';
const NFD = 'e\u0301';

const manifest = (ids: readonly string[]): IContextManifest => ({
	id: 'ctx:before',
	refs: ids.map((id): IContextRef => ({ kind: 'artifact', id })),
	summary: '',
	bytes: 0,
	contentHash: canonicalStateHash({ ids: [...ids] }),
	createdAt: 1,
});

describe('context manifest diff order', () => {
	it('orders removed refs the locale ties the same in both insertion orders', async () => {
		const compiler = createContextCompiler({
			artifactStore: fakePartial<IArtifactStore>({
				put: async () => fakePartial<IArtifactRecord<never>>({}),
			}),
			derivationEngine: directEngine(),
		});
		const empty = { ...manifest([]), contentHash: 'after' };
		const first = await compiler.diff(manifest([NFC, NFD]), empty);
		const second = await compiler.diff(manifest([NFD, NFC]), empty);
		expect(first.refs.map((ref) => ref.id)).toEqual([NFD, NFC]);
		expect(second.contentHash).toBe(first.contentHash);
	});
});
