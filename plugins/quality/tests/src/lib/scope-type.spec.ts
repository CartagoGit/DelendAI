/**
 * scope-type.spec.ts — l107 s1
 *
 * Compile-time guard that the plugin's `IScopeCommand` is
 * structurally equivalent to the core public `IValidationCommand`.
 *
 * If a future change diverges them (different fields, different
 * `expect` optionality, …) the assignability assertions below
 * fail at type-check time. The runtime `expect()` lines are a
 * belt-and-suspenders sanity check for the symbol resolution.
 */
import type { IValidationCommand } from '@mcp-vertex/core/public';
import { describe, expect, it } from 'vitest';

import type { IScopeCommand } from '@mcp-vertex/quality/lib/runner';

describe('IScopeCommand ↔ IValidationCommand (l107 s1)', () => {
	it('IScopeCommand is assignable from IValidationCommand (same source)', () => {
		const core: IValidationCommand = {
			command: 'tsc --noEmit',
			expect: 'exit0',
		};
		const plugin: IScopeCommand = core;
		expect(plugin.command).toBe('tsc --noEmit');
		expect(plugin.expect).toBe('exit0');
	});

	it('IScopeCommand requires `expect` (no longer optional)', () => {
		// @ts-expect-error — without `expect` the alias must reject.
		const _missing: IScopeCommand = { command: 'noop' };
		// Use the binding so the @ts-expect-error is not flagged as
		// unused by lint.
		expect(_missing).toBeDefined();
	});

	it('object literal conforms to both types at once', () => {
		const both: IValidationCommand & IScopeCommand = {
			command: 'mypy .',
			expect: 'pass',
		};
		expect(both).toEqual({ command: 'mypy .', expect: 'pass' });
	});
});
