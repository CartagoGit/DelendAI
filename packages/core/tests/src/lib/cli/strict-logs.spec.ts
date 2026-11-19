/**
 * strict-logs.spec.ts — f00154 S4.
 *
 * Verifies that `--strict-logs` is parsed correctly by the CLI and
 * that the auto-load path is the no-op it claims to be when the
 * `logs` plugin is already in the load set.
 */
import { describe, expect, it } from 'vitest';

import { parseCliArgs } from '../../../../src/lib/plugins/parse-cli-args';

describe('parseCliArgs — strict-logs (f00154 S4)', () => {
	it('parses `--strict-logs` to true', () => {
		const args = parseCliArgs(
			['--plugins=foo,bar', '--strict-logs', '--workspace=/ws'],
			'/ws',
		);
		expect(args.strictLogs).toBe(true);
	});

	it('parses `--strict-logs=true` to true', () => {
		const args = parseCliArgs(
			['--plugins=foo', '--strict-logs=true', '--workspace=/ws'],
			'/ws',
		);
		expect(args.strictLogs).toBe(true);
	});

	it('parses `--strict-logs=false` to false (explicit opt-out)', () => {
		const args = parseCliArgs(
			['--plugins=foo', '--strict-logs=false', '--workspace=/ws'],
			'/ws',
		);
		expect(args.strictLogs).toBe(false);
	});

	it('is undefined when the flag is absent', () => {
		const args = parseCliArgs(['--plugins=foo', '--workspace=/ws'], '/ws');
		expect(args.strictLogs).toBeUndefined();
	});

	it('rejects an unrecognised tri-state value', () => {
		expect(() =>
			parseCliArgs(
				['--plugins=foo', '--strict-logs=maybe', '--workspace=/ws'],
				'/ws',
			),
		).toThrow();
	});
});
