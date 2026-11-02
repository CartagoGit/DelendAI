import { afterEach, describe, expect, it, vi } from 'vitest';

import { initCopyButtons } from '../../src/components/ui/_code-copy-controller';

type FakeButton = {
	dataset: Record<string, string>;
	attributes: Map<string, string>;
	listeners: Map<string, () => void>;
	label: { textContent: string };
	querySelector: (selector: string) => { textContent: string } | null;
	addEventListener: (type: string, listener: () => void) => void;
	getAttribute: (name: string) => string | null;
	setAttribute: (name: string, value: string) => void;
	removeAttribute: (name: string) => void;
};

const makeButton = (text: string): FakeButton => {
	const button: FakeButton = {
		dataset: { copyText: text },
		attributes: new Map(),
		listeners: new Map(),
		label: { textContent: 'Copy' },
		querySelector: (selector) =>
			selector === '[data-copy-label="idle"]' ? button.label : null,
		addEventListener: (type, listener) => {
			button.listeners.set(type, listener);
		},
		getAttribute: (name) => button.attributes.get(name) ?? null,
		setAttribute: (name, value) => {
			button.attributes.set(name, value);
		},
		removeAttribute: (name) => {
			button.attributes.delete(name);
		},
	};
	return button;
};

const installDom = (_button: FakeButton) => {
	const previousNavigator = Object.getOwnPropertyDescriptor(
		globalThis,
		'navigator',
	);
	const previousDocument = Object.getOwnPropertyDescriptor(
		globalThis,
		'document',
	);
	const previousWindow = Object.getOwnPropertyDescriptor(
		globalThis,
		'window',
	);
	const execCommand = vi.fn(() => true);
	const textarea = {
		value: '',
		style: { position: '', left: '' },
		setAttribute: vi.fn(),
		select: vi.fn(),
	};
	const document = {
		body: {
			appendChild: vi.fn(),
			removeChild: vi.fn(),
		},
		createElement: vi.fn(() => textarea),
		execCommand,
	};

	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			clipboard: {
				writeText: vi
					.fn()
					.mockRejectedValue(new Error('permission denied')),
			},
		},
	});
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: document,
	});
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: { setTimeout },
	});

	return {
		execCommand,
		textarea,
		restore: () => {
			if (previousNavigator === undefined) {
				Reflect.deleteProperty(globalThis, 'navigator');
			} else {
				Object.defineProperty(
					globalThis,
					'navigator',
					previousNavigator,
				);
			}
			if (previousDocument === undefined) {
				Reflect.deleteProperty(globalThis, 'document');
			} else {
				Object.defineProperty(globalThis, 'document', previousDocument);
			}
			if (previousWindow === undefined) {
				Reflect.deleteProperty(globalThis, 'window');
			} else {
				Object.defineProperty(globalThis, 'window', previousWindow);
			}
		},
	};
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('initCopyButtons', () => {
	it('falls back to execCommand when the modern clipboard API rejects', async () => {
		const button = makeButton('bun run validate');
		const dom = installDom(button);
		try {
			const root = {
				querySelectorAll: () => [button],
			} as unknown as ParentNode;

			initCopyButtons(root);
			button.listeners.get('click')?.();
			await vi.waitFor(() => expect(button.dataset.state).toBe('copied'));

			expect(dom.textarea.value).toBe('bun run validate');
			expect(dom.execCommand).toHaveBeenCalledWith('copy');
			expect(button.label.textContent).toBe('Copied!');
		} finally {
			dom.restore();
		}
	});
});
