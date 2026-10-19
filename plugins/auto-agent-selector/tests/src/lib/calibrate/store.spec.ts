import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_OUTCOMES_RELATIVE_PATH } from '@delendai/core/contracts';

import { realCalibrationStore } from '../../../../src/lib/calibrate/store';

const tmp = (): string => mkdtempSync(join(tmpdir(), 'aas-calib-'));

describe('realCalibrationStore', () => {
	it('round-trips appended records', async () => {
		const store = realCalibrationStore(tmp());
		await store.append({ providerId: 'a', success: true });
		await store.append({ providerId: 'a', success: false, taskType: 'x' });
		const all = await store.readAll();
		expect(all).toHaveLength(2);
		expect(all[0]).toMatchObject({ providerId: 'a', success: true });
		expect(all[1]).toMatchObject({ taskType: 'x', success: false });
		// the store stamps a timestamp
		expect(typeof all[0]?.ts).toBe('string');
	});

	it('reads an empty history when the log does not exist', async () => {
		const store = realCalibrationStore(join(tmp(), 'nope'));
		expect(await store.readAll()).toEqual([]);
	});

	// x00190: `taskType` is free text with no cap or enum — a durable,
	// append-only log later re-surfaced via auto_recommend's blend and
	// prompt-eval's win-rate summaries — with zero redaction before this
	// fix.
	it('redacts a high-confidence secret out of taskType before persisting', async () => {
		const dir = tmp();
		const store = realCalibrationStore(dir);
		await store.append({
			providerId: 'a',
			success: true,
			taskType: 'implement: leaked key sk-ant-api03-abcdefghijklmnop',
		});
		const all = await store.readAll();
		expect(all[0]?.taskType).not.toContain('sk-ant-api03-abcdefghijklmnop');
		expect(all[0]?.taskType).toContain('[REDACTED]');
		const raw = await (await import('node:fs/promises')).readFile(
			join(dir, MODEL_OUTCOMES_RELATIVE_PATH),
			'utf8',
		);
		expect(raw).not.toContain('sk-ant-api03-abcdefghijklmnop');
	});

	it('calibrates only on judged outcomes from the shared store', async () => {
		const dir = tmp();
		const { modelOutcomeStoreAt } = await import('@delendai/core/runtime');
		const outcomes = modelOutcomeStoreAt(dir);
		await outcomes.append({ providerId: 'a', outcome: 'unknown' });
		await outcomes.append({ providerId: 'a', outcome: 'failed' });
		await outcomes.append({
			providerId: 'b',
			outcome: 'accepted',
			taskKind: 'review',
		});
		expect(await realCalibrationStore(dir).readAll()).toEqual([
			expect.objectContaining({
				providerId: 'b',
				success: true,
				taskType: 'review',
			}),
		]);
	});
});
