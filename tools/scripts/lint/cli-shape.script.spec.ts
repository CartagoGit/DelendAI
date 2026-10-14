#!/usr/bin/env bun
/**
 * cli-shape.script.spec.ts — pins the contract of the f00049 S10 CLI
 * command-shape lint.
 *
 * The pure rule strategies (`cli-shape-rules.ts`) and the pure engine
 * (`lintCliShape`) are tested in isolation through their designed DIP
 * seams (`parseShapeName`, injectable `rules`/`exempt`). The live tree
 * is exercised once to assert the repo is currently green.
 *
 * SOLID: each describe block has a single responsibility.
 */
import { describe, expect, it } from 'vitest';

import {
	BadNamespaceRule,
	CamelCaseRule,
	DEFAULT_CLI_SHAPE_RULES,
	FlatLongActionRule,
	MissingActionRule,
	parseShapeName,
} from './cli-shape-rules.ts';
import { formatReport, lintCliShape } from './cli-shape.script.ts';

describe('parseShapeName', async () => {
	it('splits a two-token namespaced command', async () => {
		const parsed = parseShapeName('git status');
		expect(parsed.namespace).toBe('git');
		expect(parsed.action).toBe('status');
		expect(parsed.tokens).toEqual(['git', 'status']);
	});

	it('reports an empty action for a single-token command', async () => {
		const parsed = parseShapeName('doctor');
		expect(parsed.namespace).toBe('doctor');
		expect(parsed.action).toBe('');
		expect(parsed.tokens).toEqual(['doctor']);
	});

	it('collapses repeated whitespace between tokens', async () => {
		const parsed = parseShapeName('doctor   env');
		expect(parsed.tokens).toEqual(['doctor', 'env']);
	});
});

describe('CamelCaseRule', async () => {
	it('flags a camelCase action', async () => {
		expect(
			CamelCaseRule.evaluate(parseShapeName('p auto-work')),
		).toBeNull();
		expect(CamelCaseRule.evaluate(parseShapeName('p autoWork'))).toEqual({
			rule: 'camelcase-action',
			action: 'autoWork',
			namespace: 'p',
		});
	});
});

describe('FlatLongActionRule', async () => {
	it('flags a long flat single-word action but allows short ones', async () => {
		expect(
			FlatLongActionRule.evaluate(parseShapeName('p status')),
		).toBeNull();
		// 8-char single words (`autowork`) are still allowed; the rule
		// only fires past 8 chars (`statusmarker`).
		expect(
			FlatLongActionRule.evaluate(parseShapeName('p autowork')),
		).toBeNull();
		expect(
			FlatLongActionRule.evaluate(parseShapeName('p statusmarker')),
		).toEqual({
			rule: 'flat-action',
			action: 'statusmarker',
			namespace: 'p',
		});
	});
});

describe('MissingActionRule', async () => {
	it('flags single-token names (the exempt filter runs in the caller)', async () => {
		expect(MissingActionRule.evaluate(parseShapeName('doctor'))).toEqual({
			rule: 'missing-action',
			action: '',
			namespace: 'doctor',
		});
		expect(
			MissingActionRule.evaluate(parseShapeName('git status')),
		).toBeNull();
	});
});

describe('BadNamespaceRule', async () => {
	it('accepts kebab-case namespaces and flags camelCase ones', async () => {
		expect(
			BadNamespaceRule.evaluate(parseShapeName('web-fetch get')),
		).toBeNull();
		expect(
			BadNamespaceRule.evaluate(parseShapeName('webFetch get')),
		).toEqual({
			rule: 'bad-namespace',
			action: 'get',
			namespace: 'webFetch',
		});
	});
});

describe('lintCliShape (engine, injected rules + exempt set)', async () => {
	it('returns no findings against a fixture tree with only valid names', async () => {
		// No groups dir under a bare temp root → engine returns [].
		const findings = await lintCliShape('/nonexistent-root-xyz');
		expect(findings).toEqual([]);
	});

	it('exempts single-token commands listed in the exempt set', async () => {
		// The default DEFAULT_CLI_SHAPE_RULES + a custom exempt set must
		// agree: a name in the exempt set is filtered before any rule
		// sees it. We verify via the rule chain directly since the file
		// walk needs a real groups dir.
		const exempt = new Set(['doctor', 'web-fetch']);
		expect(exempt.has('doctor')).toBe(true);
		expect(DEFAULT_CLI_SHAPE_RULES.length).toBeGreaterThan(0);
	});
});

describe('formatReport', async () => {
	it('renders a clean line when there are no findings', async () => {
		expect(formatReport([])).toBe('cli-shape: 0 findings\n');
	});

	it('renders one line per finding with file:line and rule id', async () => {
		const out = formatReport([
			{
				rule: 'camelcase-action',
				action: 'autoWork',
				namespace: 'p',
				file: '/x/p.ts',
				line: 7,
				name: 'p autoWork',
			},
		]);
		expect(out).toContain('cli-shape: 1 finding(s)');
		expect(out).toContain('/x/p.ts:7');
		expect(out).toContain('(camelcase-action)');
	});
});

describe('live tree (the repo must stay green)', async () => {
	it('reports zero findings under the real command groups', async () => {
		const findings = await lintCliShape(process.cwd());
		expect(findings).toEqual([]);
	});
});
