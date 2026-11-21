import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { FAILURE_LINES } from '../contracts/constants/work-answer-size.constant';
import { sizedAnswer } from './work-answer-size.service';

describe('sizedAnswer', () => {
	let cwd = '';
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'answer-size-'));
	});
	afterEach(() => rmSync(cwd, { recursive: true, force: true }));
	const base = { verbose: false, json: false } as const;

	it('[<200ms] keeps the last lines of a long failure and names the full record', () => {
		const error = Array.from({ length: 100 }, (_, i) => `line ${i}`).join(
			'\n',
		);
		const out = sizedAnswer({
			...base,
			verb: 'deliver',
			cwd,
			result: { code: EXIT_CODE.VALIDATION, error },
		});
		const lines = (out.error ?? '').split('\n');
		expect(lines).toHaveLength(FAILURE_LINES + 1);
		expect(lines[0]).toBe('line 80');
		expect(lines.at(-1)).toContain('work-deliver.log');
		expect(
			readFileSync(
				join(cwd, '.cache/delendai/results/logs/work-deliver.log'),
				'utf8',
			),
		).toContain('line 0');
	});

	it('[<200ms] answers a delivery with the pull request alone', () => {
		const out = sizedAnswer({
			...base,
			verb: 'deliver',
			cwd,
			result: {
				code: EXIT_CODE.OK,
				data: {
					delivered: 'review',
					pullRequest: { url: 'https://x/pull/7', number: 7 },
					proved: { big: 'record' },
				},
			},
		});
		expect(out.data).toBeUndefined();
		expect(out.text).toContain('url https://x/pull/7');
		expect(out.text).not.toContain('big');
	});

	it('[<200ms] leaves JSON and verbose answers whole', () => {
		const result = { code: EXIT_CODE.OK, data: { delivered: 'review' } };
		expect(
			sizedAnswer({ ...base, json: true, verb: 'deliver', cwd, result }),
		).toBe(result);
		expect(
			sizedAnswer({
				...base,
				verbose: true,
				verb: 'deliver',
				cwd,
				result,
			}),
		).toBe(result);
	});
});
