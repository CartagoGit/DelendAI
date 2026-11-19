/** failure-collectors.service.spec.ts — q00049 S1. */
import { describe, expect, it } from 'vitest';

import { createFailureCollectors } from '../../../../src/lib/collectors/failure-collectors.service';
import type { IObservation } from '../../../../src/lib/contracts/interfaces/observation.interface';
import { parseObservation } from '../../../../src/lib/store/observation-store.service';

const harness = (fail = false) => {
	const seen: IObservation[] = [];
	const collectors = createFailureCollectors(
		async (batch) => {
			if (fail) throw new Error('disk full');
			seen.push(...batch);
		},
		() => 1_000,
	);
	return { seen, collectors };
};

const report = {
	subject: 'lint:architecture',
	files: ['src/a.ts'],
	unit: 'unit-1',
	minutesLost: 4,
};

describe('failure collectors', () => {
	it('appends one observation per failure kind with class, stage, files, unit and minutes lost', async () => {
		const { seen, collectors } = harness();
		await collectors.gate(report);
		await collectors.hook(report);
		await collectors.ciJob(report);
		await collectors.landVerdict(report);
		await collectors.toolError({
			...report,
			error: new Error('Input validation error: bad'),
		});
		await collectors.deliverRefusal(report);
		expect(seen.map((o) => o.failure?.stage)).toEqual([
			'gate',
			'hook',
			'ci',
			'land',
			'runtime',
			'deliver',
		]);
		expect(seen[4]?.failure?.class).toBe('input-invalid');
		for (const o of seen) {
			expect(o.kind).toBe('failure');
			expect(o.failure).toMatchObject({
				files: ['src/a.ts'],
				unit: 'unit-1',
				minutesLost: 4,
			});
			expect(parseObservation(JSON.stringify(o))).toEqual(o);
		}
	});

	it('never lets a secret-looking value reach an observation', async () => {
		const { seen, collectors } = harness();
		const secret = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join(
			'_',
		);
		await collectors.toolError({
			subject: `call --token=${secret}`,
			files: [`/x/${secret}`],
			error: new Error(`bad token ${secret}`),
		});
		expect(JSON.stringify(seen)).not.toContain(secret);
		expect(seen).toHaveLength(1);
	});

	it('does not change the caller result when the store write fails', async () => {
		const { collectors } = harness(true);
		await expect(collectors.gate(report)).resolves.toBeUndefined();
	});
});
