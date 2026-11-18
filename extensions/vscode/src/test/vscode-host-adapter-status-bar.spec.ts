import { describe, expect, it, vi } from 'vitest';

const { FakeMarkdownString, inner } = vi.hoisted(() => {
	class FakeMarkdownString {
		isTrusted: boolean | undefined = true;
		supportThemeIcons: boolean | undefined;
		constructor(readonly value: string) {}
	}
	const inner: {
		text: string;
		tooltip: unknown;
		command: unknown;
		alignment: number;
		priority: number;
	} = {
		text: '',
		tooltip: undefined,
		command: undefined,
		alignment: 1,
		priority: 0,
	};
	return { FakeMarkdownString, inner };
});

vi.mock('vscode', () => ({
	version: '1.90.0',
	MarkdownString: FakeMarkdownString,
	StatusBarAlignment: { Left: 1, Right: 2 },
	window: { createStatusBarItem: () => inner },
}));

import { createVscodeHostAdapter } from '../host/vscode-host-adapter';

describe('the status-bar item of the VS Code host', () => {
	it('[<200ms] turns a Markdown tooltip into an untrusted MarkdownString', () => {
		const item = createVscodeHostAdapter().createStatusBarItem?.('left');

		(item as { tooltip: unknown }).tooltip = {
			value: '**x**',
			isTrusted: false,
			supportThemeIcons: true,
		};

		expect(inner.tooltip).toBeInstanceOf(FakeMarkdownString);
		expect(inner.tooltip).toMatchObject({
			value: '**x**',
			isTrusted: false,
		});
		expect(item?.tooltip).toBe('**x**');
	});

	it('[<200ms] hands a plain string tooltip through unchanged', () => {
		const item = createVscodeHostAdapter().createStatusBarItem?.('left');

		(item as { tooltip: unknown }).tooltip = 'plain';

		expect(inner.tooltip).toBe('plain');
	});
});
