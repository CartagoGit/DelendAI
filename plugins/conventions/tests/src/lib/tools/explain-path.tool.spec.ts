/**
 * f00549 S3. The tool explains a path: its role, the rule that assigned
 * it, its layer, and what that layer may not import.
 */
import { describe, expect, it } from 'vitest';

import { classifyPath, DEFAULT_TS_RULES } from '@delendai/core/public';

import { runExplainPath } from '../../../../src/lib/tools/explain-path.tool';

const parse = (result: { content: Array<{ text?: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('runExplainPath — role and rule', () => {
	it('names the role and the rule that assigned it', () => {
		const out = parse(
			runExplainPath({
				path: 'plugins/conventions/src/lib/tools/explain-path.tool.ts',
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.role).toBe('tool');
		expect(out.matchedRule).toBe('tool');
	});

	/**
	 * The invariant behind naming the rule at all: `classifyPath` returns
	 * the role but not which rule produced it, so the tool walks the same
	 * exported chain. If the walk and the classifier ever disagreed, the
	 * tool would attribute a role to the wrong rule — this is what would
	 * catch it.
	 */
	it.each([
		'plugins/x/src/lib/tools/a.tool.ts',
		'plugins/x/src/lib/contracts/interfaces/a.interface.ts',
		'plugins/x/src/lib/contracts/constants/a.constant.ts',
		'plugins/x/src/lib/services/a.service.ts',
		'plugins/x/tests/src/a.spec.ts',
		'packages/core/src/public/index.ts',
		'docs/delendai/AGENT-BOOTSTRAP.md',
	])('the named rule agrees with classifyPath for %s', (path) => {
		const out = parse(runExplainPath({ path }));
		const role = classifyPath(path);
		expect(out.role).toBe(role);
		if (role === 'other') {
			expect(out.matchedRule).toBeUndefined();
		} else {
			expect(out.matchedRule).toBe(role);
			expect(
				DEFAULT_TS_RULES.some((r) => r.name === out.matchedRule),
			).toBe(true);
		}
	});

	it('names no rule for a path nothing classifies', () => {
		const out = parse(runExplainPath({ path: 'README.md' }));
		expect(out.role).toBe('other');
		expect(out.matchedRule).toBeUndefined();
	});
});

describe('runExplainPath — layer and imports', () => {
	it('reports the layer and what it may not import, naming each enforcer', () => {
		const out = parse(
			runExplainPath({
				path: 'packages/contracts/src/thing.interface.ts',
			}),
		);
		expect(out.layer).toBe('core-contracts');
		// The layer's own rule, then the rules for all production source.
		expect(out.mayNotImport).toHaveLength(3);
		expect(out.mayNotImport[0].enforcedBy).toBe(
			'lint:no-node-imports-in-contracts',
		);
		expect(out.mayNotImport[0].because).toContain('without inheriting');
		expect(out.mayNotImport[1].enforcedBy).toBe(
			'lint:no-absolute-local-imports',
		);
		expect(out.mayNotImport[2].enforcedBy).toBe(
			'lint:no-test-support-in-production',
		);
	});

	it('gives a tools/ script the public-barrel rule', () => {
		const out = parse(
			runExplainPath({ path: 'tools/scripts/forge/demo.script.ts' }),
		);
		expect(out.layer).toBe('tools');
		expect(
			out.mayNotImport.map((r: { enforcedBy: string }) => r.enforcedBy),
		).toEqual(['lint:cli-imports', 'lint:no-absolute-local-imports']);
	});

	it('omits the layer for a path in no declared layer, without failing', () => {
		const out = parse(
			runExplainPath({ path: 'docs/delendai/AGENT-BOOTSTRAP.md' }),
		);
		expect(out.ok).toBe(true);
		expect(out.layer).toBeUndefined();
		expect(out.mayNotImport).toEqual([]);
	});
});

describe('runExplainPath — refusals', () => {
	it('refuses an empty path', () => {
		const result = runExplainPath({ path: '   ' });
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('empty');
	});
});
