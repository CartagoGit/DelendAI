import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { buildEvalCalibrateToolRegistration } from './eval-calibrate.tool';
import { resolveAutoAgentSelectorCalibrationDir } from '../calibrate/write-through';

const attempt = (
	providerId: string,
	costTier: number,
	costUsd: number,
	passed: boolean,
	skipped?: 'spend-denied',
) => ({
	providerId,
	costTier,
	costUsd,
	passed,
	...(skipped === undefined ? {} : { skipped }),
});

describe('eval-calibrate tool (f00127 S3)', () => {
	it('writes through to auto-agent-selector storage and returns win-rates', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'prompt-eval-tool-'));
		try {
			const captured = await captureToolRegistration(
				buildEvalCalibrateToolRegistration({
					namespacePrefix: 'eval',
					calibrationDir:
						resolveAutoAgentSelectorCalibrationDir(cacheDir),
				}),
			);
			const output = (await captured.invoke({
				attempts: [
					attempt('cheap', 1, 0.02, true),
					attempt('cheap', 1, 0.02, false),
					attempt('quality', 4, 0.2, true),
					attempt('skipped', 5, 0, false, 'spend-denied'),
				],
				taskType: 'implement',
			})) as {
				tool: string;
				recorded: number;
				taskType: string | null;
				winRates: Array<{
					providerId: string;
					winRate: number;
					samples: number;
				}>;
			};
			expect(output.tool).toBe('eval_calibrate');
			expect(output.recorded).toBe(3);
			expect(output.taskType).toBe('implement');
			expect(output.winRates).toEqual([
				{ providerId: 'quality', winRate: 1, samples: 1 },
				{ providerId: 'cheap', winRate: 0.5, samples: 2 },
			]);
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});
});
