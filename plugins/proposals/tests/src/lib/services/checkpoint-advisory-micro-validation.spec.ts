import { describe, expect, it } from 'vitest';

import { assessMicroValidationLoop } from '@delendai/proposals/lib/services/checkpoint-advisory-micro-validation.service';

describe('assessMicroValidationLoop', () => {
	it('does not warn on edit then test', () => {
		expect(
			assessMicroValidationLoop([
				{
					tool: 'fs_write',
					kind: 'edit',
					progressHash: 'h1',
					sliceId: 'S1',
				},
				{
					tool: 'run_quality',
					kind: 'validation',
					progressHash: 'h2',
					sliceId: 'S1',
				},
			]),
		).toBeNull();
	});

	it('does not warn on edit-test-edit-test', () => {
		expect(
			assessMicroValidationLoop([
				{
					tool: 'fs_write',
					kind: 'edit',
					progressHash: 'a',
					sliceId: 'S1',
				},
				{
					tool: 'run_quality',
					kind: 'validation',
					progressHash: 'b',
					sliceId: 'S1',
				},
				{
					tool: 'fs_write',
					kind: 'edit',
					progressHash: 'c',
					sliceId: 'S1',
				},
				{
					tool: 'run_quality',
					kind: 'validation',
					progressHash: 'd',
					sliceId: 'S1',
				},
			]),
		).toBeNull();
	});

	it('warns on repeated equivalent validation with unchanged progress', () => {
		const advisory = assessMicroValidationLoop([
			{
				tool: 'run_quality',
				kind: 'validation',
				progressHash: 'same',
				sliceId: 'S1',
			},
			{
				tool: 'run_quality',
				kind: 'validation',
				progressHash: 'same',
				sliceId: 'S1',
			},
		]);
		expect(advisory?.code).toBe('MICRO_VALIDATION_LOOP');
		expect(advisory?.nextAction).toBe('finish-slice-before-validating');
		expect(advisory?.dedupeKey).toBe('MICRO_VALIDATION:S1:same');
	});

	it('does not warn on a legitimate multi-layer suite after one slice', () => {
		expect(
			assessMicroValidationLoop(
				[
					{
						tool: 'unit',
						kind: 'validation',
						progressHash: 'done',
						sliceId: 'S1',
					},
					{
						tool: 'integration',
						kind: 'validation',
						progressHash: 'done',
						sliceId: 'S1',
					},
					{
						tool: 'e2e',
						kind: 'validation',
						progressHash: 'done',
						sliceId: 'S1',
					},
				],
				{ equivalentRunsBeforeWarning: 4 },
			),
		).toBeNull();
	});
});
