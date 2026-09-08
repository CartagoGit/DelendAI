import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	checkWorkflowSource,
	formatReport,
	lintWorkflowYaml,
	readWorkflowFiles,
	WORKFLOWS_DIR,
	type IWorkflowSource,
} from './workflow-yaml.script';

const VALID = `name: ci
on:
    push:
        branches: [develop]
jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - name: Build
              run: bun run build
`;

const source = (raw: string, relPath = 'x.yml'): IWorkflowSource => ({
	relPath: `${WORKFLOWS_DIR}/${relPath}`,
	raw,
});

describe('checkWorkflowSource — syntax', () => {
	it('accepts a well-formed workflow', () => {
		expect(checkWorkflowSource(source(VALID))).toEqual([]);
	});

	it('reports file, line and column for the i00004 regression', () => {
		// The exact shape quality-gate.yml regressed into: inside
		// `Run integrated quality gate`, `env` and `run` indented to 28
		// spaces instead of 14. No check caught it for several audits.
		const broken = `name: quality-gate
on:
    push:
        branches: [develop]
jobs:
    gate:
        runs-on: ubuntu-latest
        steps:
            - name: Run integrated quality gate
                            env:
                                CI: 'true'
                            run: bun run validate
`;
		const findings = checkWorkflowSource(
			source(broken, 'quality-gate.yml'),
		);
		expect(findings.length).toBeGreaterThan(0);
		const first = findings[0];
		expect(first?.kind).toBe('syntax');
		expect(first?.relPath).toBe(`${WORKFLOWS_DIR}/quality-gate.yml`);
		expect(first?.line).toBe(9);
		expect(first?.column).toBeGreaterThan(0);
		expect(first?.message).toContain('invalid YAML');
	});

	it('reports a plain tab/indent break with a position', () => {
		const findings = checkWorkflowSource(
			source('name: a\n  on: b\njobs: {}\n'),
		);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings[0]?.kind).toBe('syntax');
		expect(findings[0]?.line).toBeGreaterThan(0);
	});

	it('does not run shape checks once the file fails to parse', () => {
		const findings = checkWorkflowSource(source('a:\n  - b\n c\n'));
		expect(findings.every((f) => f.kind === 'syntax')).toBe(true);
	});
});

describe('checkWorkflowSource — minimal shape', () => {
	it('requires top-level name, on and jobs', () => {
		const findings = checkWorkflowSource(source('foo: bar\n'));
		const messages = findings.map((f) => f.message);
		expect(messages).toContain('missing top-level `name`');
		expect(messages).toContain('missing top-level `on`');
		expect(messages).toContain('missing top-level `jobs`');
	});

	it('does not mistake YAML 1.1 `on` for a boolean key', () => {
		// The `yaml` package parses with the 1.2 core schema, so the
		// unquoted `on:` GitHub requires stays the string key "on".
		const findings = checkWorkflowSource(source(VALID));
		expect(findings.map((f) => f.message)).not.toContain(
			'missing top-level `on`',
		);
	});

	it('requires runs-on and steps on every job, pointing at the job line', () => {
		const raw = `name: ci
on: push
jobs:
    good:
        runs-on: ubuntu-latest
        steps:
            - run: echo ok
    bad:
        timeout-minutes: 5
`;
		const findings = checkWorkflowSource(source(raw));
		expect(findings.map((f) => f.message)).toEqual([
			'job `bad` is missing `runs-on`',
			'job `bad` is missing `steps`',
		]);
		// Line 8 is `    bad:` — the position must be the job, not line 1.
		expect(findings.every((f) => f.line === 8)).toBe(true);
		expect(findings.every((f) => f.kind === 'shape')).toBe(true);
	});

	it('rejects a jobs block that is not a mapping', () => {
		const findings = checkWorkflowSource(
			source('name: a\non: push\njobs: []\n'),
		);
		expect(findings.map((f) => f.message)).toContain(
			'`jobs` must be a mapping of job id to job',
		);
	});

	it('rejects an empty jobs mapping', () => {
		const findings = checkWorkflowSource(
			source('name: a\non: push\njobs: {}\n'),
		);
		expect(findings.map((f) => f.message)).toContain(
			'`jobs` declares no job',
		);
	});

	it('rejects steps that are not a sequence', () => {
		const raw = `name: ci
on: push
jobs:
    a:
        runs-on: ubuntu-latest
        steps: nope
`;
		expect(
			checkWorkflowSource(source(raw)).map((f) => f.message),
		).toContain('job `a`: `steps` must be a sequence');
	});

	it('rejects a document root that is not a mapping', () => {
		const findings = checkWorkflowSource(source('- a\n- b\n'));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain(
			'document root must be a mapping',
		);
	});
});

describe('lintWorkflowYaml', () => {
	it('is ok over an empty set and reports what it checked', () => {
		const result = lintWorkflowYaml([]);
		expect(result.ok).toBe(true);
		expect(result.checked).toEqual([]);
	});

	it('aggregates findings across files', () => {
		const result = lintWorkflowYaml([
			source(VALID, 'ok.yml'),
			source('foo: bar\n', 'bad.yml'),
		]);
		expect(result.ok).toBe(false);
		expect(result.checked).toEqual([
			`${WORKFLOWS_DIR}/ok.yml`,
			`${WORKFLOWS_DIR}/bad.yml`,
		]);
		expect(
			result.findings.every(
				(f) => f.relPath === `${WORKFLOWS_DIR}/bad.yml`,
			),
		).toBe(true);
	});
});

describe('formatReport', () => {
	it('reports clean when ok', () => {
		const out = formatReport({
			checked: [`${WORKFLOWS_DIR}/ci.yml`],
			findings: [],
			ok: true,
		});
		expect(out).toContain('✓');
		expect(out).toContain('1 workflow file(s)');
	});

	it('names file, line and column for every finding', () => {
		const out = formatReport({
			checked: [`${WORKFLOWS_DIR}/quality-gate.yml`],
			findings: [
				{
					relPath: `${WORKFLOWS_DIR}/quality-gate.yml`,
					line: 49,
					column: 29,
					message: 'invalid YAML: boom',
					kind: 'syntax',
				},
			],
			ok: false,
		});
		expect(out).toContain('✖');
		expect(out).toContain(`${WORKFLOWS_DIR}/quality-gate.yml:49:29`);
		expect(out).toContain('invalid YAML: boom');
	});
});

describe('readWorkflowFiles', () => {
	it('picks up .yml and .yaml only, sorted, with repo-relative paths', () => {
		// `readdirSync` is the only I/O; drive it against a fixture dir
		// created for this test so the real .github/ tree is untouched.
		const dir = mkdtempSync(join(tmpdir(), 'workflow-yaml-spec-'));
		writeFileSync(join(dir, 'b.yml'), VALID);
		writeFileSync(join(dir, 'a.yaml'), VALID);
		writeFileSync(join(dir, 'README.md'), '# not a workflow');
		const files = readWorkflowFiles(dir);
		expect(files.map((f) => f.relPath)).toEqual([
			`${WORKFLOWS_DIR}/a.yaml`,
			`${WORKFLOWS_DIR}/b.yml`,
		]);
		expect(lintWorkflowYaml(files).ok).toBe(true);
	});
});

// i00004 — quality-gate.yml was invalid for several audit cycles and
// nothing said so. This pins the live tree: every workflow this repo
// ships parses and carries the expected shape, right now.
describe('acceptance: this repo\u2019s real workflows are valid', () => {
	it('every .github/workflows file parses and has the expected shape', () => {
		const repoRootDir = resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../..',
		);
		const result = lintWorkflowYaml(
			readWorkflowFiles(join(repoRootDir, WORKFLOWS_DIR)),
		);
		expect(result.findings).toEqual([]);
		expect(result.checked.length).toBeGreaterThan(0);
	});
});
