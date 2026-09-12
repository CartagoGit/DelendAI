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

	it('treats an absent required_status_checks block as "no checks"', () => {
		// GitHub OMITS the block when nothing is required, rather than
		// sending an empty list. Reading `strict` off `undefined` used to
		// compare `undefined` against a boolean.
		//
		// This spec used to assert that `{ protected: false }` was
		// rejected. That field does not exist on this endpoint at all —
		// it lives on `/branches/{branch}` — so the old assertion made
		// the guard reject every branch, protected or not. Absence of a
		// rule is a 404, and `run` reports it separately.
		expect(() => compareLive(declaration, { enforce_admins: {} })).toThrow(
			'required_status_checks.strict is false, declared true',
		);
	});

	it('fails when live required checks diverge', () => {
		expect(
			() =>
				compareLive(declaration, {
					...live,
					required_status_checks: {
						strict: true,
						contexts: ['wrong-check'],
					},
				}),
			// The message NAMES both sides now. "checks differ" sent the
			// reader back to GitHub to find out how.
		).toThrow('required status checks are [wrong-check], declared');
	});

	it('accepts the live policy when protection and checks match', () => {
		expect(() => compareLive(declaration, live)).not.toThrow();
	});
});
