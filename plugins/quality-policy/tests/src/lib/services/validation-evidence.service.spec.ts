import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	createEvidenceStoreIo,
	createFileEvidenceStore,
	deriveEvidenceKey,
	evidenceFilePath,
	findReusableEvidence,
	recordEvidence,
	type IEvidenceStore,
	type IValidationEvidence,
	type IValidationEvidenceKey,
} from '../../../../src/lib/services/validation-evidence.service';

const key = (
	partial: Partial<IValidationEvidenceKey> = {},
): IValidationEvidenceKey => ({
	validator: 'typecheck',
	scope: 'packages/core',
	inputDigest: 'input-1',
	configDigest: 'config-1',
	dependencyDigest: 'deps-1',
	...partial,
});

const evidence = (
	partial: Partial<IValidationEvidence> = {},
): IValidationEvidence => ({
	key: key(),
	result: 'pass',
	recordedAt: Date.UTC(2026, 8, 4),
	durationMs: 12_000,
	relevantInputs: ['packages/core/src/a.ts'],
	...partial,
});

const memoryStore = (): IEvidenceStore & {
	readonly entries: Map<string, IValidationEvidence>;
} => {
	const entries = new Map<string, IValidationEvidence>();
	return {
		entries,
		read: async (hash) => entries.get(hash),
		write: async (hash, value) => {
			entries.set(hash, value);
		},
	};
};

describe('validation evidence (f00506 S1)', () => {
	describe('deriveEvidenceKey', () => {
		it('is stable for the same key', () => {
			expect(deriveEvidenceKey(key())).toBe(deriveEvidenceKey(key()));
		});

		it('changes when any field that could change the answer changes', () => {
			const base = deriveEvidenceKey(key());

			expect(deriveEvidenceKey(key({ validator: 'lint' }))).not.toBe(
				base,
			);
			expect(deriveEvidenceKey(key({ scope: 'plugins/git' }))).not.toBe(
				base,
			);
			expect(deriveEvidenceKey(key({ inputDigest: 'x' }))).not.toBe(base);
			expect(deriveEvidenceKey(key({ configDigest: 'x' }))).not.toBe(
				base,
			);
			expect(deriveEvidenceKey(key({ dependencyDigest: 'x' }))).not.toBe(
				base,
			);
		});

		it('cannot be collided by shifting a delimiter across a field boundary', () => {
			// Without length prefixes, `a:b` + `c` and `a` + `b:c` would
			// concatenate identically and share a cache entry — one
			// validator silently reusing another's proof.
			expect(
				deriveEvidenceKey(key({ validator: 'a:b', scope: 'c' })),
			).not.toBe(
				deriveEvidenceKey(key({ validator: 'a', scope: 'b:c' })),
			);
		});
	});

	describe('findReusableEvidence', () => {
		it('reuses a pass recorded over an identical state', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);

			const verdict = await findReusableEvidence(key(), store);

			expect(verdict.reusable).toBe(true);
			expect(verdict.evidence?.durationMs).toBe(12_000);
		});

		it('does not reuse when a relevant digest moved', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);

			const verdict = await findReusableEvidence(
				key({ inputDigest: 'input-2' }),
				store,
			);

			expect(verdict.reusable).toBe(false);
			expect(verdict.reason).toContain('no evidence recorded');
		});

		it('does not reuse when only the config moved', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);

			expect(
				(await findReusableEvidence(key({ configDigest: 'c2' }), store))
					.reusable,
			).toBe(false);
		});

		it('does not reuse when only the dependencies moved', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);

			expect(
				(
					await findReusableEvidence(
						key({ dependencyDigest: 'd2' }),
						store,
					)
				).reusable,
			).toBe(false);
		});

		it('never reuses a recorded failure', async () => {
			// The failing run is the thing an agent is fixing. Handing
			// back yesterday's failure would hide the fix.
			const store = memoryStore();
			await recordEvidence(evidence({ result: 'fail' }), store);

			const verdict = await findReusableEvidence(key(), store);

			expect(verdict.reusable).toBe(false);
			expect(verdict.reason).toContain('never reused');
		});

		it('says nothing is recorded when nothing is', async () => {
			const verdict = await findReusableEvidence(key(), memoryStore());

			expect(verdict.reusable).toBe(false);
			expect(verdict.evidence).toBeUndefined();
		});

		it('explains a reuse well enough to audit it afterwards', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);

			const verdict = await findReusableEvidence(key(), store);

			expect(verdict.reason).toContain('2026-09-04');
			expect(verdict.evidence?.relevantInputs).toEqual([
				'packages/core/src/a.ts',
			]);
		});
	});

	describe('an unrelated change does not invalidate', () => {
		it('the same inputs under a different unrelated scope keep their own entries', async () => {
			const store = memoryStore();
			await recordEvidence(evidence(), store);
			await recordEvidence(
				evidence({ key: key({ scope: 'plugins/git' }) }),
				store,
			);

			expect(store.entries.size).toBe(2);
			expect((await findReusableEvidence(key(), store)).reusable).toBe(
				true,
			);
		});
	});
	describe('persistence (f00506 S1, reworked after review)', () => {
		const roots: string[] = [];
		const freshDir = async (): Promise<string> => {
			const dir = await mkdtemp(join(tmpdir(), 'delendai-evidence-'));
			roots.push(dir);
			return dir;
		};

		afterAll(async () => {
			for (const root of roots) {
				await rm(root, { recursive: true, force: true });
			}
		});

		it('a pass recorded by one process is found by the next one', async () => {
			// The whole point: the agent that benefits is a LATER one, in
			// a different session, that would otherwise re-run the check.
			const dir = await freshDir();
			const io = createEvidenceStoreIo();

			await recordEvidence(evidence(), createFileEvidenceStore(dir, io));
			const verdict = await findReusableEvidence(
				key(),
				createFileEvidenceStore(dir, io),
			);

			expect(verdict.reusable).toBe(true);
			expect(verdict.evidence?.durationMs).toBe(12_000);
			expect(verdict.evidence?.relevantInputs).toEqual([
				'packages/core/src/a.ts',
			]);
		});

		it('files one entry per key, so unrelated validations never contend', async () => {
			const dir = await freshDir();
			const store = createFileEvidenceStore(dir, createEvidenceStoreIo());

			await recordEvidence(evidence(), store);
			await recordEvidence(
				evidence({ key: key({ scope: 'plugins/git' }) }),
				store,
			);

			const own = await readFile(
				evidenceFilePath(dir, deriveEvidenceKey(key())),
				'utf8',
			);
			expect(JSON.parse(own)).toMatchObject({ result: 'pass' });
			expect(
				await readFile(
					evidenceFilePath(
						dir,
						deriveEvidenceKey(key({ scope: 'plugins/git' })),
					),
					'utf8',
				),
			).toContain('plugins/git');
		});

		it('reads nothing rather than throwing when nothing was ever written', async () => {
			const dir = await freshDir();
			const store = createFileEvidenceStore(dir, createEvidenceStoreIo());

			expect((await findReusableEvidence(key(), store)).reusable).toBe(
				false,
			);
		});

		it('degrades corrupt evidence into "no evidence", never into a verdict', async () => {
			// A truncated or garbled cache entry must cost one honest
			// re-run. Throwing here would turn a cache problem into a
			// failed validation, which is a false statement about the code.
			const dir = await freshDir();
			const io = createEvidenceStoreIo();
			const store = createFileEvidenceStore(dir, io);
			await recordEvidence(evidence(), store);
			await io.writeAtomic(
				evidenceFilePath(dir, deriveEvidenceKey(key())),
				'{ "result": "pa',
			);

			const verdict = await findReusableEvidence(key(), store);

			expect(verdict.reusable).toBe(false);
			expect(verdict.reason).toContain('no evidence recorded');
		});

		it('rejects a well-formed JSON file that is not evidence', async () => {
			const dir = await freshDir();
			const io = createEvidenceStoreIo();
			const store = createFileEvidenceStore(dir, io);
			await io.ensureDir(dir);
			await io.writeAtomic(
				evidenceFilePath(dir, deriveEvidenceKey(key())),
				'{"result":"pass"}',
			);

			expect((await findReusableEvidence(key(), store)).reusable).toBe(
				false,
			);
		});

		it('concurrent writes of the same key leave one whole record, never a mix', async () => {
			const dir = await freshDir();
			const store = createFileEvidenceStore(dir, createEvidenceStoreIo());

			await Promise.all(
				Array.from({ length: 8 }, async (_unused, index) =>
					recordEvidence(
						evidence({ durationMs: 1_000 + index }),
						store,
					),
				),
			);

			const raw = await readFile(
				evidenceFilePath(dir, deriveEvidenceKey(key())),
				'utf8',
			);
			const parsed = JSON.parse(raw) as IValidationEvidence;
			expect(parsed.result).toBe('pass');
			expect(parsed.durationMs).toBeGreaterThanOrEqual(1_000);
			expect(parsed.durationMs).toBeLessThanOrEqual(1_007);
		});

		it('still never reuses a failure once it is on disk', async () => {
			const dir = await freshDir();
			const store = createFileEvidenceStore(dir, createEvidenceStoreIo());
			await recordEvidence(evidence({ result: 'fail' }), store);

			const verdict = await findReusableEvidence(
				key(),
				createFileEvidenceStore(dir, createEvidenceStoreIo()),
			);

			expect(verdict.reusable).toBe(false);
			expect(verdict.reason).toContain('never reused');
		});
	});
});
