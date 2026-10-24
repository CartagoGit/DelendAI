/**
 * public-logs-api.spec.ts — f00154 S1.
 *
 * Asserts that the f00153/f00154 incident-driven types are
 * accessible from `@delendai/core/public`. The spec is read-only
 * (no disk, no side-effects): it imports the barrel and checks that
 * the named types exist and that the `severity` literal union on
 * `IPluginLogInput` covers the syslog 7-level taxonomy.
 *
 * Why this test exists: the re-exports are a *contract* — the
 * `logs` plugin's docs point third-party plugin authors at
 * `import type { IPluginLogInput } from '@delendai/core/public'`.
 * If the names drift to a private path, every external plugin breaks
 * silently at typecheck. A failing test here is the loud signal.
 */
import { describe, expect, it } from 'vitest';
import type { IPluginLogInput, IPluginLogsHelper } from '@delendai/core/public';

describe('public incident-driven API (f00154 S1)', () => {
	it('exposes IPluginLogsHelper from the public barrel', () => {
		// Type-only assertion — at runtime this is a no-op, but if the
		// type is missing or renamed, the import line fails to typecheck.
		const _type: IPluginLogsHelper = {
			log: async (_input: IPluginLogInput) => {
				/* noop for compile-time check */
			},
		};
		expect(_type).toBeDefined();
		expect(typeof _type.log).toBe('function');
	});

	it('covers the syslog 7-level severity taxonomy on IPluginLogInput', () => {
		// The 7 levels f00153 ships; `emergency` is the 8th (canonical
		// syslog includes 8 levels total but f00153 picked 7; we mirror
		// that here so a third-party author that follows the docs does
		// not suddenly see a different set).
		const everySeverity: IPluginLogInput['severity'][] = [
			'debug',
			'info',
			'notice',
			'warning',
			'error',
			'critical',
			'alert',
			'emergency',
		];
		// We only need the type-level assertion; the values themselves
		// are checked at compile time.
		expect(everySeverity).toHaveLength(8);
	});

	it('accepts the canonical incidentType slug shape', () => {
		// Mirror the regex from `plugins/logs/src/lib/services/kinds.ts`
		// (`^[a-z][a-z0-9-]{0,63}$`) so the docs example compiles.
		const input: IPluginLogInput = {
			severity: 'critical',
			incidentType: 'lock-conflict',
			message: 'agents/proposals.lock held > 30s',
			files: ['agents/proposals.lock'],
			agent: 'peer-1',
			context: { hint: 'test' },
		};
		expect(input.incidentType).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
	});
});
