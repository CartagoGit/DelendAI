/**
 * status-tool-direct-push.spec.ts — `directCommitPushAllowed` is the
 * push engine's own answer, not a second copy of its rules.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/contracts';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '@delendai/commit-policy/lib/contracts/options';
import { runPushDriver } from '@delendai/commit-policy/lib/services/push-driver';
import { runCommitPolicyStatus } from '@delendai/commit-policy/lib/tools/status-tool';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

describe('commit_policy_status direct push answer', () => {
	it('agrees with the engine where the old protected-list check did not', async () => {
		// Under a pull-request policy `develop` is not in the protected
		// list, but the engine refuses a direct push to it.
		const development = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				integration: { requiredChecks: ['delendai-validate'] },
			},
		});
		const options = CommitPolicyOptionsSchema.parse({
			push: { enabled: true, onCommit: false },
		});
		const run: IGitRunner = async (args) => {
			if (args.join(' ') === 'rev-parse --abbrev-ref HEAD')
				return ok('develop\n');
			return { ok: false, output: '', reason: 'not stubbed' };
		};

		const engine = await runPushDriver(
			{ remote: 'origin', branch: 'develop' },
			options.push,
			run,
			development,
		);
		expect(engine.ok).toBe(false);

		const result = await runCommitPolicyStatus({
			namespacePrefix: 'delendai',
			options,
			development,
			identityCtx: { run, envVars: Object.freeze({}) },
		});
		const body = result.structuredContent as {
			branchPolicy: { directCommitPushAllowed: boolean };
		};
		expect(body.branchPolicy.directCommitPushAllowed).toBe(false);
	});
});
