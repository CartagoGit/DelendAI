/**
 * registry-methods-contract.helper.ts — the registry methods the main
 * contract does not exercise, held to one text for every driver: a
 * release through the registry, gc, the reset, the seed fingerprint and
 * the three snapshot validations.
 */
import { describe, expect, it } from 'vitest';

import {
	countingProducer,
	hydrateInput,
	makeSnapshot,
	projectScope,
	type IDefineRegistry,
} from './registry-contract.helper';

export const registryMethodsContract = (
	driver: string,
	define: IDefineRegistry,
): void => {
	describe(`${driver}: the rest of the registry contract`, () => {
		const hydrated = () => {
			const registry = define({ clock: () => 0 });
			const producer = countingProducer();
			registry.defineProducer(producer);
			const result = registry.hydrate(
				hydrateInput(projectScope, producer),
			);
			if (!result.ok) throw new Error(result.reason);
			return { registry, producer, generation: result.generation };
		};

		it('releaseProjectLease drops the holder the lease added', () => {
			const { registry, generation } = hydrated();
			const lease = registry.acquireProjectLease({
				scope: projectScope,
				generationId: generation.id,
				token: generation.projectLeaseToken,
			});
			if (!('leaseId' in lease)) throw new Error(lease.reason);
			expect(registry.diagnose()[0]?.holderCount).toBe(1);
			registry.releaseProjectLease({
				scope: projectScope,
				leaseId: lease.leaseId,
			});
			expect(registry.diagnose()[0]?.holderCount).toBe(0);
		});

		it('gc keeps an active generation and counts what it reaped', () => {
			const { registry, generation } = hydrated();
			expect(registry.gc(projectScope)).toBe(0);
			expect(registry.gc()).toBe(0);
			expect(registry.diagnose().map((each) => each.id)).toContain(
				generation.id,
			);
		});

		it('resetForTests forgets every generation', () => {
			const { registry } = hydrated();
			expect(registry.diagnose()).not.toHaveLength(0);
			registry.resetForTests();
			expect(registry.diagnose()).toHaveLength(0);
		});

		it('seedFingerprint names each defined producer', () => {
			const { registry, producer } = hydrated();
			expect(
				registry.seedFingerprint().producers.map((each) => each.id),
			).toContain(producer.id);
		});

		it('validates a snapshot for integrity and against the registry', () => {
			const { registry, producer } = hydrated();
			const good = makeSnapshot(producer);
			expect(registry.validateSnapshotIntegrity(good)).toEqual([]);
			expect(registry.validateSnapshotAgainstRegistry(good)).toEqual([]);
			expect(registry.validateSnapshot(good)).toEqual([]);
			const stranger = makeSnapshot(countingProducer({ id: 'stranger' }));
			expect(
				registry.validateSnapshotAgainstRegistry(stranger),
			).not.toHaveLength(0);
			expect(registry.validateSnapshot(stranger)).not.toHaveLength(0);
		});
	});
};
