/**
 * status-tool-ahead.spec.ts — x00427 S3 acceptance.
 *
 * Verifies that commit_policy_status distinguishes:
 *   - branch ahead of upstream, push enabled, not protected → needsAttention=true
 *   - branch up to date                                  → needsAttention=false
 *   - branch with no upstream                            → ahead.count=null, reason='no_upstream'
 *   - branch ahead of upstream but push disabled         → needsAttention=false
 *
 * The probes (rev-parse @{upstream} + gitUnpushedCommitCount) are mocked
 * via an IGitRunner stub so the test exercises the orchestration logic,
 * not the git binary.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunResult, IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '@delendai/commit-policy/lib/contracts/options';
import { runCommitPolicyStatus } from '@delendai/commit-policy/lib/tools/status-tool';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const buildRunner = (
	map: ReadonlyArray<readonly [string, IGitRunResult]>,
): IGitRunner => {
	const responses = new Map<string, IGitRunResult>(
		map.map(([k, v]) => [k, v]),
	);
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

const baseOptions = (pushOverrides: Record<string, unknown> = {}) => {
	const parsed = CommitPolicyOptionsSchema.parse({
		commit: { enabled: true },
		identity: { mode: 'global' },
		cadence: { triggers: [] },
		push: { enabled: true, onCommit: false, ...pushOverrides },
	});
	return parsed;
};

const aheadFromResult = (
	result: unknown,
): {
	readonly count: number | null;
	readonly upstream: string | null;
	readonly needsAttention: boolean;
	readonly reason: string | null;
} => {
	// biome-ignore lint/suspicious/noExplicitAny: schema is loose
	const payload =
		(result as any).structuredContent ?? (result as any).content;
	return payload.push.ahead;
};

describe('status-tool ahead state (x00427 S3)', () => {
	it('reports ahead=0, no attention, when branch is up to date', async () => {
		const runner = buildRunner([
			['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('develop')],
			[
				'rev-parse\u0000--abbrev-ref\u0000@{upstream}',
				ok('origin/develop'),
			],
			['rev-list\u0000--count\u0000@{upstream}..HEAD', ok('0')],
		]);
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: baseOptions(),
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		expect(result.isError).toBeUndefined();
		expect(aheadFromResult(result)).toEqual({
			count: 0,
			upstream: 'origin/develop',
			needsAttention: false,
			reason: null,
		});
	});

	it('reports ahead>0 + needsAttention when push enabled and branch unprotected', async () => {
		const runner = buildRunner([
			['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('feature/x')],
			[
				'rev-parse\u0000--abbrev-ref\u0000@{upstream}',
				ok('origin/feature/x'),
			],
			['rev-list\u0000--count\u0000@{upstream}..HEAD', ok('6')],
		]);
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: baseOptions(),
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		expect(result.isError).toBeUndefined();
		expect(aheadFromResult(result)).toEqual({
			count: 6,
			upstream: 'origin/feature/x',
			needsAttention: true,
			reason: null,
		});
	});

	it('reports no upstream (count=null, reason="no_upstream") when rev-parse fails', async () => {
		const runner = buildRunner([
			['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('local-only')],
			[
				'rev-parse\u0000--abbrev-ref\u0000@{upstream}',
				{ ok: false, output: '', reason: 'no upstream' },
			],
		]);
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: baseOptions(),
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		expect(result.isError).toBeUndefined();
		expect(aheadFromResult(result)).toEqual({
			count: null,
			upstream: null,
			needsAttention: false,
			reason: 'no_upstream',
		});
	});

	it('does not flag attention when push is disabled, even with unpushed commits', async () => {
		const runner = buildRunner([
			['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('feature/x')],
			[
				'rev-parse\u0000--abbrev-ref\u0000@{upstream}',
				ok('origin/feature/x'),
			],
			['rev-list\u0000--count\u0000@{upstream}..HEAD', ok('3')],
		]);
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: baseOptions({ enabled: false }),
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		expect(result.isError).toBeUndefined();
		const ahead = aheadFromResult(result);
		expect(ahead.count).toBe(3);
		expect(ahead.needsAttention).toBe(false);
	});
});
