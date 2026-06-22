import { describe, expect, it } from 'vitest';

import {
	QUICK_ACTION_CATEGORIES,
	defaultQuickActions,
	filterByHost,
} from './quick-actions';

describe('defaultQuickActions', () => {
	it('returns exactly 10 actions in a stable order', () => {
		const a = defaultQuickActions();
		expect(a).toHaveLength(10);
		expect(a.map((x) => x.id)).toEqual([
			'proposals.board',
			'knowledge.openNavigator',
			'logs.openToday',
			'docs.openApi',
			'quality.runValidation',
			'git.status',
			'memory.search',
			'notification.test',
			'deps.check',
			'web.fetch',
		]);
	});

	it('each action carries the required fields', () => {
		for (const a of defaultQuickActions()) {
			expect(a.id).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
			expect(a.labelKey.length).toBeGreaterThan(0);
			expect(a.icon.length).toBeGreaterThan(0);
			expect(a.command.startsWith('mcp-vertex.')).toBe(true);
			expect(QUICK_ACTION_CATEGORIES).toContain(a.category);
		}
	});

	it('only plugin-gated actions declare `requires`', () => {
		const gated = defaultQuickActions().filter(
			(a) => a.requires !== undefined,
		);
		const ids = gated.map((a) => a.id).sort();
		expect(ids).toEqual([
			'deps.check',
			'git.status',
			'logs.openToday',
			'notification.test',
			'web.fetch',
		]);
	});
});

describe('filterByHost', () => {
	it('returns the same set when no loadedPlugins are given', () => {
		const a = defaultQuickActions();
		expect(filterByHost(a, 'vscode', [])).toEqual(a);
	});

	it('drops actions whose `requires` is not satisfied', () => {
		const a = defaultQuickActions();
		const out = filterByHost(a, 'vscode', ['git', 'logs']);
		const ids = out.map((x) => x.id);
		expect(ids).toContain('git.status');
		expect(ids).toContain('logs.openToday');
		expect(ids).not.toContain('deps.check');
		expect(ids).not.toContain('notification.test');
		expect(ids).not.toContain('web.fetch');
	});

	it('keeps actions whose `requires` is empty', () => {
		const a = defaultQuickActions();
		const out = filterByHost(a, 'vscode', []);
		expect(out.find((x) => x.id === 'proposals.board')).toBeDefined();
	});
});
