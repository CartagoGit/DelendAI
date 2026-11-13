/**
 * sast-scan.helper.spec.ts — security_audit's SAST pass: the stack's rules
 * through the runner, and a skip with its install hint when none can run.
 */
import { describe, expect, it } from 'vitest';

import { runSastScan } from '../../../src/lib/audit/sast-scan.helper';
import type {
	IDetectedStack,
	ISastRunResult,
} from '../../../src/lib/contracts/interfaces/sast.interface';
import { MissingCliError } from '../../../src/lib/sast/exports';

const stack = async (): Promise<IDetectedStack> => ({
	pack: 'node' as IDetectedStack['pack'],
	languages: ['typescript'],
	files: ['src/a.ts'],
});

describe('runSastScan', () => {
	it('folds the runner findings into a sast scan result', async () => {
		const result = await runSastScan('/ws', {
			detectStack: stack,
			runSastRunner: async (input) => {
				expect(input.runner).toBe('auto');
				const result: ISastRunResult = {
					source: 'fallback',
					scanned: 1,
					findings: [
						{
							ruleId: 'sast-eval',
							severity: 'high',
							message: 'eval of input',
						},
					],
				};
				return result;
			},
		});
		expect(result.tool).toBe('sast');
		expect(result.findings).toHaveLength(1);
		expect(result.skipped).toBeUndefined();
	});

	it('reports the pass as skipped, with the install hint, when no runner can work', async () => {
		const result = await runSastScan('/ws', {
			detectStack: stack,
			runSastRunner: async () => {
				throw new MissingCliError('semgrep');
			},
		});
		expect(result.skipped).toBe(true);
		expect(result.note).toContain('semgrep');
	});
});
