/**
 * f00549 S2. The tool answers where a new file belongs, and the answer
 * is checked against the classifier before it is returned — so these
 * cases pin both the placement table and that invariant.
 */
import { describe, expect, it } from 'vitest';

import { runSuggestPath } from '../../../../src/lib/tools/suggest-path.tool';

const parse = (result: { content: Array<{ text?: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('runSuggestPath — placement', () => {
	it('puts a tool under tools/ with the mirrored spec path', () => {
		const out = parse(
			runSuggestPath({
				role: 'tool',
				package: 'plugins/conventions',
				name: 'suggest path',
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.path).toBe(
			'plugins/conventions/src/lib/tools/suggest-path.tool.ts',
		);
		expect(out.specPath).toBe(
			'plugins/conventions/tests/src/lib/tools/suggest-path.tool.spec.ts',
		);
		expect(out.role).toBe('tool');
	});

	it('puts an interface under contracts/interfaces/', () => {
		const out = parse(
			runSuggestPath({
				role: 'interface',
				package: 'plugins/conventions',
				name: 'layer graph',
			}),
		);
		expect(out.path).toBe(
			'plugins/conventions/src/lib/contracts/interfaces/layer-graph.interface.ts',
		);
	});

	it('puts a constant under contracts/constants/', () => {
		const out = parse(
			runSuggestPath({
				role: 'constant',
				package: 'plugins/conventions',
				name: 'layer graph',
			}),
		);
		expect(out.path).toBe(
			'plugins/conventions/src/lib/contracts/constants/layer-graph.constant.ts',
		);
	});

	/**
	 * The invariant the slice is built on: every role the table knows
	 * must produce a path the classifier assigns that same role. If the
	 * table and the classifier ever disagree, the tool refuses rather
	 * than answering — and this is what would catch it.
	 */
	it.each([
		'interface',
		'constant',
		'service',
		'tool',
		'registry',
		'register',
		'factory',
		'builder',
		'helper',
	])('suggests a path the classifier agrees is a %s', (role) => {
		const out = parse(
			runSuggestPath({
				role,
				package: 'plugins/demo',
				name: 'thing here',
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.role).toBe(role);
	});

	it('normalises a trailing slash on the package', () => {
		const out = parse(
			runSuggestPath({
				role: 'service',
				package: 'plugins/conventions/',
				name: 'thing',
			}),
		);
		expect(out.path).toBe(
			'plugins/conventions/src/lib/services/thing.service.ts',
		);
	});
});

describe('runSuggestPath — naming', () => {
	it.each([
		['layer graph', 'layer-graph'],
		['layerGraph', 'layer-graph'],
		['layer_graph', 'layer-graph'],
		['  Layer  Graph  ', 'layer-graph'],
	])('slugifies %s to %s', (name, slug) => {
		const out = parse(
			runSuggestPath({ role: 'service', package: 'pkg', name }),
		);
		expect(out.path).toBe(`pkg/src/lib/services/${slug}.service.ts`);
	});

	it('reports the dot-not-hyphen and I-prefix rules', () => {
		const out = parse(
			runSuggestPath({ role: 'service', package: 'pkg', name: 'thing' }),
		);
		expect(out.rules.join(' ')).toContain('Always dot, never hyphen');
		expect(out.rules.join(' ')).toContain('starts with `I`');
	});

	it('adds the tools/ co-location rule for a tool', () => {
		const out = parse(
			runSuggestPath({ role: 'tool', package: 'pkg', name: 'thing' }),
		);
		expect(out.rules.join(' ')).toContain('MUST live under a `tools/`');
	});

	it('adds the contracts/ co-location rule for an interface', () => {
		const out = parse(
			runSuggestPath({
				role: 'interface',
				package: 'pkg',
				name: 'thing',
			}),
		);
		expect(out.rules.join(' ')).toContain(
			'matching `contracts/` subfolder',
		);
	});
});

describe('runSuggestPath — refusals', () => {
	it('refuses a role it has no placement rule for', () => {
		const result = runSuggestPath({
			role: 'nonesuch',
			package: 'pkg',
			name: 'thing',
		});
		expect(result.isError).toBe(true);
		const out = parse(result);
		expect(out.error.reason).toContain('no placement rule');
		expect(out.error.nextAction).toContain('service');
	});

	it('refuses a name that slugifies to nothing', () => {
		const result = runSuggestPath({
			role: 'service',
			package: 'pkg',
			name: '///',
		});
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('empty slug');
	});
});
