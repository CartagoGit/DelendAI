/**
 * `apps/shared/src/components/ui/stepper.spec.ts` —
 * `renderStepper` unit tests.
 *
 * Contract pinned:
 *   - root is `<ol class="delendai-stepper" start="…">`
 *   - one `<li class="delendai-stepper__item">` per step
 *   - each item has `<span class="delendai-stepper__num">` with the
 *     step number (1-indexed from `start`, default 1)
 *   - inline `` `backticks` `` in step bodies are split into
 *     `<code>` chips; the rest is escaped plain text
 *   - the whole body is wrapped in
 *     `<div class="delendai-stepper__body"><p class="delendai-stepper__text">`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderStepper } from './stepper';

describe('renderStepper', () => {
	it('emits the canonical ol root with the default start (1)', () => {
		const out = renderStepper({ steps: ['Step one', 'Step two'] });
		expect(out).toContain('<ol class="delendai-stepper" start="1">');
	});

	it('renders one <li class="delendai-stepper__item"> per step', () => {
		const out = renderStepper({ steps: ['A', 'B', 'C'] });
		expect(
			out.match(/<li class="delendai-stepper__item">/g) ?? [],
		).toHaveLength(3);
	});

	it('numbers the items sequentially starting at the default', () => {
		const out = renderStepper({ steps: ['A', 'B', 'C'] });
		expect(out).toContain('>1</span>');
		expect(out).toContain('>2</span>');
		expect(out).toContain('>3</span>');
	});

	it('honours a custom start', () => {
		const out = renderStepper({ steps: ['A', 'B'], start: 5 });
		expect(out).toContain('start="5"');
		expect(out).toContain('>5</span>');
		expect(out).toContain('>6</span>');
	});

	it('splits `backticks` into <code> chips', () => {
		const out = renderStepper({
			steps: ['Run `bun install` to fetch deps.'],
		});
		expect(out).toContain(
			'<p class="delendai-stepper__text">Run <code>bun install</code> to fetch deps.</p>',
		);
	});

	it('escapes HTML in the step text', () => {
		const out = renderStepper({ steps: ['<bad>&"\''] });
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).not.toContain('<bad>');
	});

	it('escapes the code-chip text', () => {
		const out = renderStepper({ steps: ['`x<y&z`'] });
		expect(out).toContain('<code>x&lt;y&amp;z</code>');
	});

	it('renders the wrapping delendai-stepper__body div per item', () => {
		const out = renderStepper({ steps: ['A'] });
		expect(out).toContain('<div class="delendai-stepper__body">');
	});
});
