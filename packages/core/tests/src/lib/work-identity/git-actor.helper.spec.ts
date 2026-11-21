/**
 * git-actor.helper.spec.ts — who is running git, whatever the host.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '../../../../src/lib/development-policy/resolve';
import {
	gitActorMarker,
	unknownActorOf,
} from '../../../../src/lib/work-identity/git-actor.helper';

const shared = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
});
const sharedPerson = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		guard: { unknownActor: 'person' },
	},
});
const worktrees = resolveDevelopmentPolicy({
	development: { profile: 'worktree-pr' },
});

describe('unknownActorOf', () => {
	it('defaults to agent in a pinned shared checkout and person elsewhere', () => {
		expect(unknownActorOf(shared)).toBe('agent');
		expect(unknownActorOf(worktrees)).toBe('person');
	});

	it('takes the project declaration over the default', () => {
		expect(unknownActorOf(sharedPerson)).toBe('person');
	});
});

describe('gitActorMarker', () => {
	it('identifies an agent by a host marker before anything else', () => {
		expect(
			gitActorMarker({
				env: { CODEX_SANDBOX: '1', CI: 'true' },
				policy: sharedPerson,
			}),
		).toBe('CODEX_SANDBOX');
	});

	it('identifies an agent by the unit worktree', () => {
		expect(
			gitActorMarker({ env: {}, policy: sharedPerson, unitAgent: 'glm' }),
		).toBe('the worktree delendai made for glm');
	});

	it('identifies a delendai session, but not inside CI', () => {
		expect(
			gitActorMarker({
				env: { DELENDAI_SESSION: '1' },
				policy: sharedPerson,
			}),
		).toContain('DELENDAI_SESSION');
		expect(
			gitActorMarker({
				env: { DELENDAI_SESSION: '1', CI: 'true' },
				policy: shared,
			}),
		).toBe(undefined);
	});

	it('leaves CI exempt when no marker identifies an agent', () => {
		expect(gitActorMarker({ env: { CI: 'true' }, policy: shared })).toBe(
			undefined,
		);
	});

	it('lets the policy decide for an unidentified actor', () => {
		expect(gitActorMarker({ env: {}, policy: shared })).toContain(
			'unidentified actor',
		);
		expect(gitActorMarker({ env: {}, policy: sharedPerson })).toBe(
			undefined,
		);
		expect(gitActorMarker({ env: {}, policy: worktrees })).toBe(undefined);
	});
});
