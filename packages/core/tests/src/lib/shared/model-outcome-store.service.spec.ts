/**
 * model-outcome-store.service.spec.ts — one append-only store of how each
 * model did, which also reads the old calibration lines.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_OUTCOMES_RELATIVE_PATH } from '../../../../src/lib/contracts/constants/model-outcomes.constant';
import {
	modelOutcomeStoreAt,
	outcomeOfLine,
} from '../../../../src/lib/shared/model-outcome-store.service';

// Assembled at run time: a key-shaped literal is rewritten by the secrets hook.
const leaked = ['sk', 'ant', 'api03', 'abcdefghijklmnop'].join('-');

describe('the model outcome store', () => {
	it('appends outcomes, stamps them, and redacts what it writes', async () => {
		const cache = mkdtempSync(join(tmpdir(), 'outcomes-'));
		const store = modelOutcomeStoreAt(cache);
		await store.append({
			providerId: 'opus',
			accountId: 'work',
			taskKind: `implement with ${leaked}`,
			outcome: 'unknown',
			latencyMs: 1200,
		});
		await store.append({
			providerId: 'opus',
			outcome: 'failed',
			at: 'then',
		});
		const all = await store.readAll();
		expect(all.map((each) => each.outcome)).toEqual(['unknown', 'failed']);
		expect(typeof all[0]?.at).toBe('string');
		expect(all[1]?.at).toBe('then');
		expect(
			readFileSync(join(cache, MODEL_OUTCOMES_RELATIVE_PATH), 'utf8'),
		).not.toContain(leaked);
	});

	it('reads an empty history when nothing was written', async () => {
		expect(
			await modelOutcomeStoreAt(
				mkdtempSync(join(tmpdir(), 'none-')),
			).readAll(),
		).toEqual([]);
	});

	it('reads a calibration line as an accepted or rejected outcome, and skips what is neither', () => {
		expect(
			outcomeOfLine({ providerId: 'a', success: false, ts: 't' }),
		).toEqual({
			providerId: 'a',
			outcome: 'rejected',
			at: 't',
		});
		expect(
			outcomeOfLine({ providerId: 'a', outcome: 'bogus' }),
		).toBeUndefined();
		expect(outcomeOfLine('text')).toBeUndefined();
	});
});
