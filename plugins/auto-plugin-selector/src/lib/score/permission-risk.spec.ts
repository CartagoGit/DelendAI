/**
 * permission-risk.spec.ts — f00180 S3: per-tool permission-risk scoring.
 *
 * The new helper `scorePermissionRiskForManifest` unifies the legacy
 * global `permissions` array with the new per-tool `toolPermissions`
 * map. These specs pin the contract:
 *
 *  - Manifests with ONLY the legacy global array return the same
 *    score as the pre-f00180 reduce.
 *  - Manifests with the per-tool map return the SUM over the union
 *    of the global set and every per-tool set (so a tool whose
 *    per-tool entry grants a NEW permission, beyond the global set,
 *    is still credited).
 *  - Per-tool entries override the global set when scoring a
 *    SPECIFIC tool via `scorePermissionRiskForTool`.
 */
import { describe, expect, it } from 'vitest';

import {
	scorePermissionRiskForManifest,
	scorePermissionRiskForTool,
} from './permission-risk';

describe('scorePermissionRiskForManifest (f00180)', () => {
	it('returns the sum of weights for the legacy global permissions array (no map)', () => {
		const result = scorePermissionRiskForManifest({
			permissions: ['filesystem-read', 'git-write'],
		});
		// filesystem-read = 1, git-write = 3 → 4
		expect(result).toBe(4);
	});

	it('returns 0 for a manifest without permissions AND without toolPermissions', () => {
		expect(scorePermissionRiskForManifest({})).toBe(0);
	});

	it('sums the union of global + per-tool sets when both are present', () => {
		const result = scorePermissionRiskForManifest({
			permissions: ['filesystem-read'],
			toolPermissions: {
				commit: ['git-write'],
				push: ['git-write', 'network'],
			},
		});
		// global: filesystem-read (1)
		// per-tool: git-write (3), network (2)
		// union: filesystem-read + git-write + network → 1 + 3 + 2 = 6
		expect(result).toBe(6);
	});

	it('does not double-count duplicate permissions', () => {
		const result = scorePermissionRiskForManifest({
			permissions: ['filesystem-read', 'filesystem-read'],
		});
		expect(result).toBe(1);
	});

	it('treats the per-tool map alone as sufficient (no global array)', () => {
		const result = scorePermissionRiskForManifest({
			toolPermissions: {
				status: ['git-read'],
			},
		});
		expect(result).toBe(1);
	});
});

describe('scorePermissionRiskForTool (f00180)', () => {
	const global: readonly ('git-read' | 'git-write')[] = [
		'git-read',
		'git-write',
	];
	const perTool: Readonly<
		Record<string, readonly ('git-read' | 'git-write')[]>
	> = {
		status: ['git-read'],
		commit: ['git-write'],
	};

	it('returns the per-tool entry when present, ignoring the global set', () => {
		// `commit` is in per-tool as `git-write` (3); global also has
		// `git-write`, but the helper returns the per-tool set as-is
		// so the caller can decide what to do with it.
		expect(
			scorePermissionRiskForTool({
				toolPermissions: perTool,
				permissions: global,
				toolId: 'commit',
			}),
		).toBe(3);
	});

	it('falls back to the global permissions when the tool is not in the map', () => {
		expect(
			scorePermissionRiskForTool({
				toolPermissions: perTool,
				permissions: global,
				toolId: 'unknown_tool',
			}),
		).toBe(4); // git-read (1) + git-write (3)
	});

	it('returns 0 when neither the per-tool map nor the global set declare permissions', () => {
		expect(
			scorePermissionRiskForTool({
				toolPermissions: undefined,
				permissions: undefined,
				toolId: 'any-tool',
			}),
		).toBe(0);
	});
});
