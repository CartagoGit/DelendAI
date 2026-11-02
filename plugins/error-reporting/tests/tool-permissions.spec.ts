/**
 * tool-permissions.spec.ts — each error-reporting tool asks only for what
 * it does: both read local state, neither inherits the reporter's grants.
 */
import { describe, expect, it } from 'vitest';

import { resolveToolPermissions } from '@delendai/core/public';

import manifest from '../plugin.manifest';

describe('error-reporting tool permissions', () => {
	it.each(['report_status', 'diagnose_log'])(
		'%s needs only to read',
		(tool) => {
			expect(
				resolveToolPermissions(
					manifest.toolPermissions,
					manifest.permissions,
					tool,
				),
			).toEqual(['filesystem-read']);
		},
	);
});
