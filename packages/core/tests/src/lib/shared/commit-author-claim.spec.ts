/**
 * commit-author-claim.spec.ts — the commit author and the work ref are
 * named by one resolution, so they cannot drift apart (f00777).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitAuthorIdentityFor } from '../../../../src/lib/shared/commit-author';
import {
	agentClaim,
	agentFor,
} from '../../../../src/lib/work-units/work-unit-shared.service';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('one identity, one author', () => {
	it('names the author after the same agent the work ref is named after', () => {
		vi.stubEnv('DELENDAI_AGENT_ID', 'glm-5.3-flash');
		const axis = { providerBridge: false };
		expect(
			commitAuthorIdentityFor(agentClaim({ axis }), 'copilot').modelName,
		).toBe(agentFor([], undefined, axis));
		expect(
			commitAuthorIdentityFor(agentClaim({ model: 'qwen-3.8-max', axis }))
				.modelName,
		).toBe(agentFor(['--agent=qwen-3.8-max'], undefined, axis));
	});

	it('records an unverified claim as unverified, never a plausible name', () => {
		vi.stubEnv('DELENDAI_AGENT_ID', '');
		const author = commitAuthorIdentityFor(
			agentClaim({ axis: { providerBridge: false } }),
		);
		expect(author).toEqual({
			clientName: 'agent',
			modelName: 'unverified-model',
		});
		expect(
			commitAuthorIdentityFor(
				{ id: 'client-code', source: 'client' },
				'vscode',
			).modelName,
		).toBe('unverified-model');
	});
});
