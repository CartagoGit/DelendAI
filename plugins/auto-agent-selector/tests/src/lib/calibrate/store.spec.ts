import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
});
