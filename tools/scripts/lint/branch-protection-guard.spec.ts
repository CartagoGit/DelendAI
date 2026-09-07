import { describe, expect, it } from 'vitest';

import {
	assertDeclaration,
	compareLive,
	parseDeclaration,
} from './branch-protection-guard.script';

const declaration = parseDeclaration(`
branches:
    - name: develop
      protection:
          required_status_checks:
              strict: true
              contexts:
                  - delendai-validate
          enforce_admins: true
          required_linear_history: true
          allow_force_pushes: false
          allow_deletions: false
          restrictions: null
`);

const live = {
	protected: true,
	required_status_checks: {
		strict: true,
		contexts: ['delendai-validate'],
	},
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
};

describe('branch-protection-guard', () => {
	it('accepts a valid declarative policy without bypass entries', () => {
		expect(() => assertDeclaration(declaration)).not.toThrow();
		expect(declaration.restrictions).toBeNull();
	});

	it('fails when the live branch is unprotected', () => {
		expect(() => compareLive(declaration, { protected: false })).toThrow(
			'live develop branch is not protected',
		);
	});

	it('fails when live required checks diverge', () => {
		expect(() =>
			compareLive(declaration, {
				...live,
				required_status_checks: {
					strict: true,
					contexts: ['wrong-check'],
				},
			}),
		).toThrow('live develop required status checks differ');
	});

	it('accepts the live policy when protection and checks match', () => {
		expect(() => compareLive(declaration, live)).not.toThrow();
	});
});
