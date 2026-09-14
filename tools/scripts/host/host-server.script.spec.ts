import { describe, expect, it } from 'vitest';

import {
	hasHelpFlag,
	HYDRATION_INTERVAL_ENV,
	hydrationIntervalMs,
	resolveWorkspaceFlag,
} from './host-server.script';

describe('hasHelpFlag', () => {
	it('recognizes long and short help flags', () => {
		expect(hasHelpFlag(['--help'])).toBe(true);
		expect(hasHelpFlag(['-h'])).toBe(true);
	});

	it('does not treat unrelated flags as help', () => {
		expect(hasHelpFlag(['--workspace=/tmp/x'])).toBe(false);
	});
});

// x00186 (F27): pure unit coverage for the argv parsing this entrypoint
// uses to resolve `--workspace` before falling back to cwd/env. The e2e
// spawn tests in host-graceful-shutdown.spec.ts cover the full boot path.
describe('resolveWorkspaceFlag', () => {
	it('reads the `=` form', () => {
		expect(
			resolveWorkspaceFlag(['--workspace=/tmp/x', '--preset=lean']),
		).toBe('/tmp/x');
	});

	it('reads the space-separated form', () => {
		expect(resolveWorkspaceFlag(['--workspace', '/tmp/x'])).toBe('/tmp/x');
	});

	it('returns undefined when the flag is absent', () => {
		expect(resolveWorkspaceFlag(['--preset=lean'])).toBeUndefined();
	});

	it('returns undefined when --workspace is the last token with no value', () => {
		expect(
			resolveWorkspaceFlag(['--preset=lean', '--workspace']),
		).toBeUndefined();
	});

	it('prefers the first occurrence when passed twice', () => {
		expect(
			resolveWorkspaceFlag(['--workspace=/first', '--workspace=/second']),
		).toBe('/first');
	});
});

describe('hydrationIntervalMs', () => {
	it('defers to core when the operator said nothing', () => {
		// `undefined` is not "off": it means the cadence is core's to
		// choose, so the default lives in one place instead of two.
		expect(hydrationIntervalMs({})).toBeUndefined();
	});

	it('honours an explicit interval', () => {
		expect(hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: '5000' })).toBe(
			5000,
		);
	});

	it('treats 0 as off, because that is a decision', () => {
		expect(hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: '0' })).toBe(0);
	});

	it('falls back to the default on an unreadable value, never to silence', () => {
		// "off" has to be something somebody chose. A typo that turned
		// the background refresh off would reproduce the exact bug this
		// watch exists to fix, and leave no trace of why.
		for (const raw of ['abc', '-1', '']) {
			expect(
				hydrationIntervalMs({ [HYDRATION_INTERVAL_ENV]: raw }),
			).toBeUndefined();
		}
	});
});
