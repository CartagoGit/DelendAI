import { describe, expect, it } from 'vitest';

// Auto-version derivation lives at the repo root (scripts/). Its pure helpers
// are unit-tested + typechecked alongside the monorepo, like release-plan.
import { applyBump, classifyBump } from '../../../scripts/derive-version';

describe('classifyBump (Conventional Commits → bump)', () => {
	it('feat → minor', () => {
		expect(classifyBump(['feat: add x'])).toBe('minor');
		expect(classifyBump(['feat(core): add x'])).toBe('minor');
	});

	it('fix / perf → patch', () => {
		expect(classifyBump(['fix: y'])).toBe('patch');
		expect(classifyBump(['perf: faster'])).toBe('patch');
	});

	it('breaking (! or BREAKING CHANGE) → major', () => {
		expect(classifyBump(['feat!: drop api'])).toBe('major');
		expect(classifyBump(['fix(core)!: change shape'])).toBe('major');
		expect(classifyBump(['feat: a\n\nBREAKING CHANGE: removed z'])).toBe('major');
	});

	it('only docs/chore/ci/test/style/build/refactor/revert → none', () => {
		expect(classifyBump(['docs: readme', 'chore: deps', 'ci: tweak'])).toBe('none');
		expect(classifyBump(['refactor: tidy', 'test: more', 'style: fmt'])).toBe('none');
	});

	it('non-conventional commit with content → patch (safe default)', () => {
		expect(classifyBump(['Implement feature X to improve things'])).toBe('patch');
	});

	it('takes the strongest bump across a mixed set', () => {
		expect(classifyBump(['docs: a', 'fix: b', 'feat: c'])).toBe('minor');
		expect(classifyBump(['feat: a', 'fix!: b'])).toBe('major');
		expect(classifyBump(['docs: a', 'chore: b'])).toBe('none');
	});

	it('ignores merge commits and blank entries', () => {
		expect(classifyBump(['Merge branch develop', '   ', 'docs: x'])).toBe('none');
		expect(classifyBump(['Merge pull request #1', 'feat: real'])).toBe('minor');
	});
});

describe('applyBump', () => {
	it('bumps and resets lower components', () => {
		expect(applyBump('0.1.0', 'patch')).toBe('0.1.1');
		expect(applyBump('0.1.4', 'minor')).toBe('0.2.0');
		expect(applyBump('1.2.3', 'major')).toBe('2.0.0');
		expect(applyBump('1.2.3', 'none')).toBe('1.2.3');
	});

	it('rejects a non-semver version', () => {
		expect(() => applyBump('latest', 'patch')).toThrow();
	});
});
