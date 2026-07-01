import { describe, expect, it } from 'vitest';

import { renderToast } from '../../src/components/toast';
import { componentScript } from '../../src/components/runtime';

describe('renderToast', () => {
	it('renders a sticky close button only when ttl is 0 (H25)', () => {
		const sticky = renderToast({ id: 't1', message: 'hi', ttl: 0 });
		expect(sticky).toContain('class="mv-toast__close"');
		expect(sticky).toContain('data-mv-toast-close="t1"');
		expect(sticky).toContain('aria-label="Close"');
		expect(sticky).toContain('data-mv-toast-sticky="true"');
	});

	it('omits the close button for auto-dismissing toasts', () => {
		const transient = renderToast({ id: 't2', message: 'hi', ttl: 4000 });
		expect(transient).not.toContain('mv-toast__close');
		expect(transient).not.toContain('data-mv-toast-sticky');
		expect(transient).toContain('data-mv-toast-ttl="4000"');
	});

	it('defaults to an auto-dismissing toast with no close button', () => {
		const def = renderToast({ id: 't3', message: 'hi' });
		expect(def).not.toContain('mv-toast__close');
		expect(def).toContain('data-mv-toast-ttl="4000"');
	});

	it('escapes the toast id in the close button', () => {
		const html = renderToast({ id: '"><x', message: 'm', ttl: 0 });
		expect(html).not.toContain('data-mv-toast-close=""><x"');
		expect(html).toContain('&quot;&gt;&lt;x');
	});
});

describe('toast runtime wiring (H25)', () => {
	it('binds an Esc handler that dismisses the most recent sticky toast', () => {
		expect(componentScript).toContain('data-mv-toast-sticky="true"');
		expect(componentScript).toContain("evt.key !== 'Escape'");
		expect(componentScript).toContain('dismissToast(stickies[stickies.length - 1]')
	});

	it('dispatches a mv-toast-dismiss custom event the host can listen to', () => {
		expect(componentScript).toContain("new CustomEvent('mv-toast-dismiss'");
		expect(componentScript).toContain('data-mv-toast-close');
	});
});
