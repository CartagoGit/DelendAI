/**
 * effect-broker.spec.ts — r00037 S2.
 *
 * `createEffectBroker` is the composition primitive: given a map of
 * named `{ kind, perform, describe? }` definitions, it returns the
 * matching map of guarded capabilities, each refusing its real effect
 * while the ambient dry-run scope (`dry-run/dry-run-scope.helper.ts`)
 * is active. These specs validate the primitive in isolation, with
 * synthetic capabilities across every `TEffectCapabilityKind` — before
 * S3 wires it into a real plugin context.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
	createEffectBroker,
	guardWithAmbientDryRun,
} from '@delendai/core/lib/capabilities/effect-broker.factory';
import { DryRunEffectRefusedError } from '@delendai/core/lib/dry-run/effect-guard.helper';
import { runWithDryRunScope } from '@delendai/core/lib/dry-run/dry-run-scope.helper';
import type { TEffectCapabilityKind } from '@delendai/core/lib/contracts/interfaces/effect-guard.interface';

describe('createEffectBroker', () => {
	it('builds a guarded capability per definition, preserving keys and arity', async () => {
		const writes: string[] = [];
		const deletes: string[] = [];
		const broker = createEffectBroker({
			write: {
				kind: 'write',
				perform: (path: string, contents: string) => {
					writes.push(`${path}:${contents}`);
				},
			},
			remove: {
				kind: 'delete',
				perform: (path: string) => {
					deletes.push(path);
				},
			},
		});

		await runWithDryRunScope(false, async () => {
			broker.write('a.txt', 'hello');
			broker.remove('b.txt');
		});

		expect(writes).toEqual(['a.txt:hello']);
		expect(deletes).toEqual(['b.txt']);
	});

	it('refuses every capability in the map while the ambient scope is dry-run', async () => {
		const calls: string[] = [];
		const broker = createEffectBroker({
			write: {
				kind: 'write',
				perform: () => {
					calls.push('write');
				},
			},
			spawn: {
				kind: 'spawn',
				perform: () => {
					calls.push('spawn');
				},
			},
			network: {
				kind: 'network',
				perform: () => {
					calls.push('network');
				},
			},
			git: {
				kind: 'git',
				perform: () => {
					calls.push('git');
				},
			},
			remove: {
				kind: 'delete',
				perform: () => {
					calls.push('delete');
				},
			},
		});

		await runWithDryRunScope(true, async () => {
			expect(() => broker.write()).toThrow(DryRunEffectRefusedError);
			expect(() => broker.spawn()).toThrow(DryRunEffectRefusedError);
			expect(() => broker.network()).toThrow(DryRunEffectRefusedError);
			expect(() => broker.git()).toThrow(DryRunEffectRefusedError);
			expect(() => broker.remove()).toThrow(DryRunEffectRefusedError);
		});

		// No `perform` for ANY of the five categories was ever reached —
		// the refusal happens before the real effect, not after it.
		expect(calls).toEqual([]);
	});

	it('folds `describe` into the refusal reason for easier debugging', async () => {
		const broker = createEffectBroker({
			write: {
				kind: 'write',
				perform: (path: string) => path,
				describe: (path: string) => `writing ${path}`,
			},
		});

		await runWithDryRunScope(true, async () => {
			try {
				broker.write('secret.env');
				expect.unreachable('expected a refusal');
			} catch (error) {
				expect(error).toBeInstanceOf(DryRunEffectRefusedError);
				expect((error as DryRunEffectRefusedError).message).toContain(
					'writing secret.env',
				);
			}
		});
	});

	it('re-checks the ambient scope per call — one broker instance safely serves both dry-run and real calls', async () => {
		const calls: string[] = [];
		const broker = createEffectBroker({
			write: {
				kind: 'write',
				perform: (label: string) => {
					calls.push(label);
				},
			},
		});

		await runWithDryRunScope(true, async () => {
			expect(() => broker.write('first')).toThrow(
				DryRunEffectRefusedError,
			);
		});
		await runWithDryRunScope(false, async () => broker.write('second'));
		await runWithDryRunScope(true, async () => {
			expect(() => broker.write('third')).toThrow(
				DryRunEffectRefusedError,
			);
		});

		expect(calls).toEqual(['second']);
	});

	it('behaves exactly like the wrapped function outside any dry-run scope', () => {
		const calls: string[] = [];
		const broker = createEffectBroker({
			write: {
				kind: 'write',
				perform: (label: string) => {
					calls.push(label);
					return label.length;
				},
			},
		});

		expect(broker.write('outside')).toBe(7);
		expect(calls).toEqual(['outside']);
	});

	describe('guardWithAmbientDryRun (single-capability escape hatch)', () => {
		it('is the same guard createEffectBroker composes internally', async () => {
			const calls: string[] = [];
			const guarded = guardWithAmbientDryRun({
				kind: 'network',
				perform: (url: string) => {
					calls.push(url);
				},
			});

			await runWithDryRunScope(true, async () => {
				expect(() => guarded('https://example.test')).toThrow(
					DryRunEffectRefusedError,
				);
			});
			expect(calls).toEqual([]);
		});
	});

	describe('property: no combination of capability kind × dryRun ever lets a mutation through under dryRun: true', () => {
		it('holds for every TEffectCapabilityKind and arbitrary call arguments', () => {
			const kinds: readonly TEffectCapabilityKind[] = [
				'write',
				'delete',
				'spawn',
				'network',
				'git',
			];

			fc.assert(
				fc.asyncProperty(
					fc.constantFrom(...kinds),
					fc.boolean(),
					fc.array(fc.string(), { maxLength: 3 }),
					async (kind, dryRun, callArgs) => {
						let reached = false;
						const broker = createEffectBroker({
							subject: {
								kind,
								perform: (...args: readonly string[]) => {
									reached = true;
									return args;
								},
							},
						});

						await runWithDryRunScope(dryRun, async () => {
							if (dryRun) {
								expect(() =>
									broker.subject(...callArgs),
								).toThrow(DryRunEffectRefusedError);
							} else {
								broker.subject(...callArgs);
							}
						});

						// The invariant under test: `dryRun: true` implies the
						// real `perform` was NEVER reached, for every kind and
						// every argument shape fast-check generates.
						expect(reached).toBe(!dryRun);
					},
				),
			);
		});
	});
});
