/**
 * reset-ci-env.setup.ts
 *
 * `proposal-transition.tool.ts` gates `review`/`done` transitions on
 * `isCiEnvironment()`, which reads `process.env.CI` and
 * `process.env.GITHUB_ACTIONS` directly. A real GitHub Actions runner
 * sets BOTH of those to `"true"` for every job — including the job that
 * runs this very test suite — so any spec that exercises a transition
 * to `review`/`done` without CI-evidence frontmatter trips the
 * `missing-ci-evidence` gate before its own assertions even run. That
 * masked failure surfaced as ~28 CI-only failures across
 * `proposal-transition.tool.spec.ts`, `peer-review-gate.spec.ts`, and
 * `proposal-transition.e2e.spec.ts` (all pass locally, where CI/
 * GITHUB_ACTIONS are unset).
 *
 * Reset these vars before every test in this project so specs stay
 * hermetic regardless of the host's ambient environment. The 3 specs
 * that deliberately test the CI-evidence gate set `process.env.CI`
 * (and `GITHUB_SHA`) explicitly inside their own `it` blocks and
 * restore them in a `finally`, so they are unaffected by this reset.
 */
import { afterEach, beforeEach } from 'vitest';

const CI_ENV_KEYS = ['CI', 'GITHUB_ACTIONS', 'GITHUB_SHA'] as const;
type CiEnvKey = (typeof CI_ENV_KEYS)[number];

let savedValues: Partial<Record<CiEnvKey, string>> = {};

beforeEach(() => {
	savedValues = {};
	for (const key of CI_ENV_KEYS) {
		const value = process.env[key];
		if (value !== undefined) savedValues[key] = value;
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of CI_ENV_KEYS) {
		const value = savedValues[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});
