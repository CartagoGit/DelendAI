/**
 * status-tool.spec.ts — verifies the snapshot reflects the
 * configured options and resolves identity at call time.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '@delendai/commit-policy/lib/contracts/options';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import { withOkEnvelope } from '@delendai/core/plugin';

import { STATUS_OUTPUT_SCHEMA } from '@delendai/commit-policy/lib/contracts/constants/status-tool.constant';

import {
	buildStatusToolRegistration,
	runCommitPolicyStatus,
} from '@delendai/commit-policy/lib/tools/status-tool';
import type { BranchProtectionAdapter } from '@delendai/commit-policy/lib/contracts/branch-protection-contracts';

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
			namespacePrefix: 'delendai',
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
			namespacePrefix: 'delendai',
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
			namespacePrefix: 'delendai',
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

	/**
	 * The declared outputSchema must accept what the handler actually
	 * sends. `toolOk` puts `{ ok: true, ... }` on the wire, and a client
	 * that listed tools validates structuredContent against the advertised
	 * JSON Schema, which forbids undeclared keys — so a schema without
	 * `ok` made this tool reject its own successful answer.
	 *
	 * `.strict()` is what reproduces that: plain Zod strips unknown keys,
	 * so a non-strict parse passes whatever the schema declares. This tool
	 * even `safeParse`d its own pre-envelope payload against the same
	 * schema, which agreed with it and caught nothing.
	 */
	it('declares an output schema that accepts its own success envelope', async () => {
		const parsed = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
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
			namespacePrefix: 'delendai',
			options: parsed,
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});

		expect(
			withOkEnvelope(STATUS_OUTPUT_SCHEMA)
				.strict()
				.parse(result.structuredContent),
		).toMatchObject({ ok: true });
	});

	type Handler = (args: unknown) => Promise<{
		readonly isError?: boolean;
		readonly structuredContent?: unknown;
	}>;

	const identityRunner = (upstream: string, ahead: string): IGitRunner =>
		buildRunner(
			new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
				['rev-parse\u0000--abbrev-ref\u0000HEAD', ok('feature/x\n')],
				['rev-parse\u0000--abbrev-ref\u0000@{upstream}', ok(upstream)],
				['rev-list\u0000--count\u0000@{upstream}..HEAD', ok(ahead)],
			]),
		);

	/** The registration path: nothing exercised it, so it went unmeasured. */
	it('registers the tool and answers through the registered handler', async () => {
		let name: string | undefined;
		let handler: Handler | undefined;
		const server = createFakeToolServer({
			onRegisterTool: (tool) => {
				name = tool.name;
				handler = tool.handler as Handler;
			},
		});

		await buildStatusToolRegistration({
			namespacePrefix: 'delendai',
			options: CommitPolicyOptionsSchema.parse({
				commit: { enabled: true },
				identity: { mode: 'global' },
			}),
			identityCtx: {
				run: identityRunner('origin/develop\n', '0'),
				envVars: Object.freeze({}),
			},
		}).register(server);

		expect(name).toBe('delendai_commit_policy_status');
		const result = await handler!({});
		expect(
			withOkEnvelope(STATUS_OUTPUT_SCHEMA)
				.strict()
				.parse(result.structuredContent),
		).toMatchObject({ ok: true });
	});

	it('reports every cadence trigger kind, the push counters and a fresh remote snapshot', async () => {
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: CommitPolicyOptionsSchema.parse({
				commit: { enabled: true },
				identity: { mode: 'global' },
				cadence: {
					triggers: [
						{ kind: 'threshold', files: 3 },
						{ kind: 'interval', minutes: 15 },
						{ kind: 'slice', onStatuses: ['done'] },
					],
				},
				push: {
					enabled: true,
					everyNCommits: 5,
					everyNMinutes: 30,
					protectedPrefixes: ['release/'],
				},
			}),
			identityCtx: {
				run: identityRunner('origin/develop\n', '2'),
				envVars: Object.freeze({}),
			},
			branchProtectionAdapter: fakePartial<BranchProtectionAdapter>({
				getLastResult: () => ({
					ok: true,
					state: 'fresh',
					provider: 'github',
					remoteName: 'origin',
					remoteHost: 'github.com',
					remoteBranches: ['main'],
					effectiveBranches: ['main'],
				}),
			}),
		});

		const body = withOkEnvelope(STATUS_OUTPUT_SCHEMA)
			.strict()
			.parse(result.structuredContent) as {
			cadence: { triggerCount: number };
			push: { everyNCommits?: number; everyNMinutes?: number };
			branchPolicy: { remote: { ok: boolean } | null };
		};
		expect(body.cadence.triggerCount).toBe(3);
		expect(body.push.everyNCommits).toBe(5);
		expect(body.push.everyNMinutes).toBe(30);
		expect(body.branchPolicy.remote?.ok).toBe(true);
	});

	it('keeps the remote identity when the refresh failed, and reports no upstream', async () => {
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: CommitPolicyOptionsSchema.parse({
				commit: { enabled: true },
				identity: { mode: 'global' },
			}),
			identityCtx: {
				run: buildRunner(
					new Map<string, IGitRunResult>([
						[
							'config\u0000--global\u0000user.name',
							ok('Cartago\n'),
						],
						[
							'config\u0000--global\u0000user.email',
							ok('cartago@example.com\n'),
						],
						[
							'rev-parse\u0000--abbrev-ref\u0000HEAD',
							ok('develop\n'),
						],
					]),
				),
				envVars: Object.freeze({}),
			},
			branchProtectionAdapter: fakePartial<BranchProtectionAdapter>({
				getLastResult: () => ({
					ok: false,
					state: 'error',
					reason: 'gh exited 1',
					provider: 'github',
					remoteName: 'origin',
					remoteHost: 'github.com',
					remoteBranches: [],
					effectiveBranches: [],
				}),
			}),
		});

		const body = withOkEnvelope(STATUS_OUTPUT_SCHEMA)
			.strict()
			.parse(result.structuredContent) as {
			branchPolicy: {
				remote: { ok: boolean; remoteName?: string } | null;
			};
		};
		expect(body.branchPolicy.remote?.ok).toBe(false);
		expect(body.branchPolicy.remote?.remoteName).toBe('origin');
	});

	it('omits the remote identity the failed refresh never learned', async () => {
		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options: CommitPolicyOptionsSchema.parse({
				commit: { enabled: true },
				identity: { mode: 'global' },
			}),
			identityCtx: {
				run: identityRunner('', '0'),
				envVars: Object.freeze({}),
			},
			branchProtectionAdapter: fakePartial<BranchProtectionAdapter>({
				getLastResult: () => ({
					ok: false,
					state: 'unsupported',
					reason: 'no forge CLI',
					remoteBranches: [],
					effectiveBranches: [],
				}),
			}),
		});

		const body = withOkEnvelope(STATUS_OUTPUT_SCHEMA)
			.strict()
			.parse(result.structuredContent) as {
			branchPolicy: { remote: { remoteName?: string } | null };
		};
		expect(body.branchPolicy.remote?.remoteName).toBeUndefined();
	});
});
