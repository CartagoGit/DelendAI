/**
 * status-tool.spec.ts — verifies the snapshot reflects the
 * configured options and resolves identity at call time.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import { CommitPolicyOptionsSchema } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { runCommitPolicyStatus } from '@mcp-vertex/commit-policy/lib/tools/status-tool';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const buildRunner = (
	responses: ReadonlyMap<string, IGitRunResult>,
): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		const key = args.join('\u0000');
		const direct = responses.get(key);
		if (direct !== undefined) return Promise.resolve(direct);
		return Promise.resolve({
			ok: false,
			output: '',
			reason: 'not stubbed',
		});
	};
	return handler as IGitRunner;
};

describe('commit_policy_status', () => {
	it('returns the configured snapshot verbatim', async () => {
		const parsed = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
			cadence: {
				triggers: [
					{ kind: 'slice', onStatuses: ['done'] },
					{ kind: 'interval', minutes: 15 },
				],
			},
			push: { enabled: true, onCommit: true },
		});
		const runner = buildRunner(
			new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
				['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('develop\n')],
			]),
		);
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'mcp-vertex',
			options: parsed,
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			commit: { enabled: boolean };
			identity: {
				mode: string;
				effective: { displayName: string } | null;
			};
			cadence: {
				triggerCount: number;
				triggers: readonly { kind: string }[];
			};
			push: { enabled: boolean; onCommit: boolean };
			branchPolicy: {
				current: string | null;
				protectedBranches: readonly string[];
				protectedPrefixes: readonly string[];
				directCommitPushAllowed: boolean;
				remote: null;
			};
			summary: string;
		};
		expect(body.ok).toBe(true);
		expect(body.commit.enabled).toBe(true);
		expect(body.identity.mode).toBe('global');
		expect(body.identity.effective?.displayName).toBe('Cartago');
		expect(body.cadence.triggerCount).toBe(2);
		expect(body.cadence.triggers.map((t) => t.kind)).toEqual([
			'slice',
			'interval',
		]);
		expect(body.push.enabled).toBe(true);
		expect(body.push.onCommit).toBe(true);
		// The v2 default protects `main` literally and ships the
		// `release/*` pattern serialized as a regexp token.
		expect(body.branchPolicy).toEqual({
			current: 'develop',
			protectedBranches: ['/^release\\//'],
			protectedPrefixes: [],
			directCommitPushAllowed: true,
			remote: null,
		});
		expect(body.summary).toContain('commit=on');
	});

	it('surfaces a resolution error when identity cannot resolve', async () => {
		const parsed = CommitPolicyOptionsSchema.parse({});
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'mcp-vertex',
			options: parsed,
			identityCtx: {
				run: buildRunner(new Map()),
				envVars: Object.freeze({}),
			},
		});
		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			identity: {
				effective: unknown;
				resolutionError: string | null;
			};
		};
		expect(body.identity.effective).toBeNull();
		expect(body.identity.resolutionError).not.toBeNull();
	});

	it('renders the Spanish summary when locale=es', async () => {
		const parsed = CommitPolicyOptionsSchema.parse({});
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'mcp-vertex',
			options: parsed,
			identityCtx: {
				run: buildRunner(new Map()),
				envVars: Object.freeze({}),
			},
			locale: 'es',
		});
		const body = result.structuredContent as { summary: string };
		expect(body.summary).toContain('desactivado');
	});
});
