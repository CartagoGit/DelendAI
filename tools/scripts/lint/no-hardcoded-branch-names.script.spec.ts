import { describe, expect, it } from 'vitest';

import {
	branchLiteralsIn,
	findBranchLiterals,
} from './no-hardcoded-branch-names.script';

describe('no-hardcoded-branch-names (x00589)', () => {
	it('finds a branch name a project assumed', () => {
		expect(branchLiteralsIn("const base = 'develop';")).toHaveLength(1);
		expect(branchLiteralsIn('resolveRef(run, "master")')).toHaveLength(1);
		expect(branchLiteralsIn('const b = `trunk`;')).toHaveLength(1);
	});

	it('does not count a comment that explains why the name is NOT used', () => {
		// Otherwise the rule punishes the very documentation that records
		// the decision, and the next person deletes the explanation to
		// make it pass.
		expect(
			branchLiteralsIn("// Not `'develop'`: that is one project's name."),
		).toEqual([]);
		expect(
			branchLiteralsIn(" * `develop` is this repository's habit."),
		).toEqual([]);
	});

	it('says nothing about a name that is not a trunk', () => {
		expect(branchLiteralsIn("const ref = 'my-feature';")).toEqual([]);
		expect(branchLiteralsIn("const ref = 'release/2026.4';")).toEqual([]);
	});

	it('reports the line and the literal as written', () => {
		const [hit] = branchLiteralsIn("a\nb\nconst x = 'develop';\n");
		expect(hit?.line).toBe(3);
		expect(hit?.match).toBe("'develop'");
	});

	it('scans the files it is handed', () => {
		const findings = findBranchLiterals([
			{ path: 'a.ts', text: "const b = 'develop';" },
			{ path: 'b.ts', text: 'const b = base;' },
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toBe('a.ts');
	});
});
