import { describe, expect, it } from 'vitest';

import { renderToast } from '../../src/components/toast';
import { componentScript } from '../../src/components/runtime';

describe('renderToast', () => {
	it('renders a sticky close button only when ttl is 0 (H25)', () => {
		const sticky = renderToast({ id: 't1', message: 'hi', ttl: 0 });
		expect(sticky).toContain('class="mcpv-toast__close"');
		expect(sticky).toContain('data-mcpv-toast-close="t1"');
		expect(sticky).toContain('aria-label="Close"');
		expect(sticky).toContain('data-mcpv-toast-sticky="true"');
	});

	it('omits the close button for auto-dismissing toasts', () => {
		const transient = renderToast({ id: 't2', message: 'hi', ttl: 4000 });
		expect(transient).not.toContain('mcpv-toast__close');
		expect(transient).not.toContain('data-mcpv-toast-sticky');
		expect(transient).toContain('data-mcpv-toast-ttl="4000"');
	});

	it('defaults to an auto-dismissing toast with no close button', () => {
		const def = renderToast({ id: 't3', message: 'hi' });
		expect(def).not.toContain('mcpv-toast__close');
		expect(def).toContain('data-mcpv-toast-ttl="4000"');
	});

	it('escapes the toast id in the close button', () => {
		const html = renderToast({ id: '"><x', message: 'm', ttl: 0 });
		expect(html).not.toContain('data-mcpv-toast-close=""><x"');
		expect(html).toContain('&quot;&gt;&lt;x');
	});
});

describe('toast runtime wiring (H25)', () => {
	it('binds an Esc handler that dismisses the most recent sticky toast', () => {
		expect(componentScript).toContain('data-mcpv-toast-sticky="true"');
		expect(componentScript).toContain("evt.key !== 'Escape'");
		expect(componentScript).toContain(
			'dismissToast(stickies[stickies.length - 1]',
		);
	});

	it('dispatches a mcpv-toast-dismiss custom event the host can listen to', () => {
		expect(componentScript).toContain(
			"new CustomEvent('mcpv-toast-dismiss'",
		);
		expect(componentScript).toContain('data-mcpv-toast-close');
	});
});
