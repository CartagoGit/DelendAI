import { describe, expect, it } from 'vitest';

import {
	type IArtifactKey,
	type IArtifactRecord,
} from '../../../src/lib/artifact-store.interface';
import {
	type IDerivation,
	type IDerivationEngine,
	type IDerivationInput,
} from '../../../src/lib/derivation-engine.interface';
import { canonicalStateHash } from '../../../src/lib/hash';
import { asWorktreeId, type StateScope } from '../../../src/lib/scope';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-derivations'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

class MapDerivationEngine implements IDerivationEngine {
	readonly #registry = new Map<string, IDerivation<unknown, unknown>>();

	constructor(
		private readonly now: () => number,
		private readonly reconciledCommitSha: string,
	) {}

	register<TIn, TOut>(d: IDerivation<TIn, TOut>): void {
		this.#registry.set(d.name, d as IDerivation<unknown, unknown>);
	}

	async apply<TIn, TOut>(
		name: string,
		input: IDerivationInput<TIn>,
	): Promise<IArtifactRecord<TOut>> {
		const derivation = this.#registry.get(name) as
			| IDerivation<TIn, TOut>
			| undefined;
		if (derivation === undefined) {
			throw new Error(`Unknown derivation: ${name}`);
		}
		const value = await derivation.derive(input);
		return createRecord(
			{
				scope: input.inputs[0]?.key.scope ?? scope,
				kind: 'fingerprint',
				id: `${derivation.name}:${derivation.fingerprint(input)}`,
			},
			value,
			this.now(),
			this.reconciledCommitSha,
		);
	}
}

function createRecord<T>(
	key: IArtifactKey,
	value: T,
	now: number,
	reconciledCommitSha: string,
): IArtifactRecord<T> {
	return {
		key,
		value,
		contentHash: canonicalStateHash(value as never),
		createdAt: now,
		updatedAt: now,
		reconciledCommitSha,
	};
}

function acceptsDerivationEngine<T extends IDerivationEngine>(engine: T): T {
	return engine;
}

describe('derivation-engine.interface (c00523 S2)', () => {
	it('compiles against the derivation engine contract', () => {
		const engine = acceptsDerivationEngine(
			new MapDerivationEngine(() => 2000, 'def456'),
		);
		expect(engine).toBeInstanceOf(MapDerivationEngine);
	});

	it('applies a registered derivation through a stub engine', async () => {
		const inputRecord = createRecord(
			{ scope, kind: 'snapshot', id: 'snapshot-1' },
			{ count: 2 },
			1500,
			'def456',
		);
		const input: IDerivationInput<{ count: number }> = {
			inputs: [inputRecord],
			fingerprint: 'fp:count',
		};
		const engine = new MapDerivationEngine(() => 2000, 'def456');
		engine.register<{ count: number }, { doubled: number }>({
			name: 'double-count',
			derive: async ({ inputs }) => ({
				doubled: inputs[0]!.value.count * 2,
			}),
			fingerprint: ({ fingerprint }) => `${fingerprint}:v1`,
		});

		const record = await engine.apply<
			{ count: number },
			{ doubled: number }
		>('double-count', input);

		expect(record.key.kind).toBe('fingerprint');
		expect(record.key.id).toBe('double-count:fp:count:v1');
		expect(record.value).toEqual({ doubled: 4 });
		expect(record.reconciledCommitSha).toBe('def456');
	});
});
