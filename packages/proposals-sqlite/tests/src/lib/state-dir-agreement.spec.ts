/**
 * state-dir-agreement.spec.ts — the state directory this package opens is
 * the one core's upgrade moves the legacy state into. Core may not import
 * this package, so the two name it apart and this pins that they agree.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	LEGACY_STATE_SEGMENTS,
	STATE_SEGMENTS,
} from '@delendai/core/lib/workspace-migration/migrators/state-dir.constant';

import { resolveProposalsDbPaths } from '../../../src/lib/db-path';

describe('the state directory', () => {
	it('is where core migrates the legacy state to', () => {
		const root = '/workspace';
		expect(resolveProposalsDbPaths(root).stateDir).toBe(
			join(root, ...STATE_SEGMENTS),
		);
		expect(LEGACY_STATE_SEGMENTS).toEqual(['.delendai', 'state']);
	});
});
