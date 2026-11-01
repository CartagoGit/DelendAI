import { describe, expect, it } from 'vitest';

import { holdToolCalls, toolCallsReleased } from './tool-call-hold.helper';

describe('holdToolCalls', () => {
	it('lets a call through when nothing holds it', async () => {
		await expect(toolCallsReleased()).resolves.toBeUndefined();
	});

	it('keeps a call waiting until the start releases it', async () => {
		const release = holdToolCalls();
		const steps: string[] = [];
		const call = toolCallsReleased().then(() => steps.push('called'));
		await Promise.resolve();
		steps.push('settled');
		release();
		await call;
		expect(steps).toEqual(['settled', 'called']);
	});

	it('leaves a later hold in place when an earlier one is released', async () => {
		const first = holdToolCalls();
		const second = holdToolCalls();
		first();
		let through = false;
		const call = toolCallsReleased().then(() => {
			through = true;
		});
		await Promise.resolve();
		expect(through).toBe(false);
		second();
		await call;
		expect(through).toBe(true);
	});
});
