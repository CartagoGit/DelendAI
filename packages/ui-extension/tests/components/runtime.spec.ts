import { describe, expect, it } from 'vitest';

import { renderHostBridge } from '../../src/components/host-bridge';
import { componentScript, renderRuntime } from '../../src/components/runtime';

describe('runtime', async () => {
	it('componentScript is a non-empty string', async () => {
		expect(componentScript.length).toBeGreaterThan(100);
	});

	it('componentScript wires the three delegations', async () => {
		expect(componentScript).toContain('data-mv-action');
		expect(componentScript).toContain('data-mv-toggle');
		expect(componentScript).toContain('data-mv-lang');
	});

	it('componentScript closes dropdowns on outside-click and Esc', async () => {
		expect(componentScript).toContain('Escape');
		expect(componentScript).toContain('closeAllDropdowns');
	});

	it('keeps tolerated host failures out of the user console', async () => {
		expect(componentScript).not.toContain('console.error');
		expect(renderHostBridge()).not.toContain('console.error');
	});

	it('renderRuntime wraps the script in a <script> tag', async () => {
		const html = renderRuntime();
		expect(html).toMatch(/^<script>/);
		expect(html).toMatch(/<\/script>$/);
	});
});
