// ci-rules.spec.ts: pin the SOLID CI detection table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_CI_RULES,
	matchCi,
} from '@mcp-vertex/core/lib/bootstrap/ci-rules';

const reader = (
	files: Record<string, string>,
	emptyDirs: readonly string[] = [],
): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: (p) => {
		// `emptyDirs` simulates "path exists but has no entries".
		if (emptyDirs.includes(p)) return [];
		return p in files ? ['exists'] : [];
	},
});

describe('DEFAULT_CI_RULES (declarative table)', () => {
	it('lists the five built-in CI systems', () => {
		const ids = DEFAULT_CI_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'github-actions',
			'gitlab-ci',
			'azure-pipelines',
			'circleci',
			'jenkins',
		]);
	});
	it('github-actions is the highest-priority (most common in mcp-vertex projects)', () => {
		const gh = DEFAULT_CI_RULES.find((r) => r.id === 'github-actions');
		const jk = DEFAULT_CI_RULES.find((r) => r.id === 'jenkins');
		expect(gh?.priority).toBeGreaterThan(jk?.priority ?? 0);
	});
});

describe('matchCi', () => {
	it('returns an empty list when no CI file is present', () => {
		expect(matchCi(reader({}))).toEqual([]);
	});
	it('detects GitHub Actions when `.github/workflows` is a non-empty dir', () => {
		const result = matchCi(reader({ '.github/workflows': 'dir' }));
		expect(result).toContain('github-actions');
	});
	it('does NOT detect GitHub Actions when the dir is empty', () => {
		const result = matchCi(reader({}, ['.github/workflows']));
		expect(result).not.toContain('github-actions');
	});
	it('detects GitLab CI from .gitlab-ci.yml', () => {
		expect(
			matchCi(reader({ '.gitlab-ci.yml': 'stages: [test]' })),
		).toContain('gitlab-ci');
	});
	it('detects multiple CI systems in priority order', () => {
		const result = matchCi(
			reader({
				'.github/workflows': 'dir',
				'.gitlab-ci.yml': 'stages: [test]',
				Jenkinsfile: 'pipeline {}',
			}),
		);
		// Priority order: github-actions > gitlab-ci > jenkins.
		expect(result).toEqual(['github-actions', 'gitlab-ci', 'jenkins']);
	});
	it('a custom rule table overrides the default', () => {
		// A host that wants their internal CI outranking GitHub.
		const result = matchCi(
			reader({
				'.github/workflows': 'dir',
				'.internal/ci.yml': 'pipeline {}',
			}),
			[
				{ id: 'internal-ci', path: '.internal/ci.yml', priority: 1000 },
				...DEFAULT_CI_RULES,
			],
		);
		expect(result[0]).toBe('internal-ci');
	});
});

describe('integration: detectCi uses the rule table', () => {
	it('analyzer picks up GitLab CI for a project that ships .gitlab-ci.yml', () => {
		const analysis = analyzeProject(
			reader({
				'.gitlab-ci.yml': 'stages: [test]',
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.ci).toContain('gitlab-ci');
	});
});
