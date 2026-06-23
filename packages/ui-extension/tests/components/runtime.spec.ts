import { describe, expect, it } from 'vitest';

import { renderHostBridge } from '../../src/components/host-bridge';
import { componentScript, renderRuntime } from '../../src/components/runtime';

describe('runtime', () => {
	it('componentScript is a non-empty string', () => {
		expect(componentScript.length).toBeGreaterThan(100);
	});

	it('componentScript wires the three delegations', () => {
		expect(componentScript).toContain('data-mv-action');
		expect(componentScript).toContain('data-mv-toggle');
		expect(componentScript).toContain('data-mv-lang');
	});

	it('componentScript closes dropdowns on outside-click and Esc', () => {
		expect(componentScript).toContain('Escape');
		expect(componentScript).toContain('closeAllDropdowns');
	});

	it('keeps tolerated host failures out of the user console', () => {
		expect(componentScript).not.toContain('console.error');
		expect(renderHostBridge()).not.toContain('console.error');
	});

	it('renderRuntime wraps the script in a <script> tag', () => {
		const html = renderRuntime();
		expect(html).toMatch(/^<script>/);
		expect(html).toMatch(/<\/script>$/);
	});
});
