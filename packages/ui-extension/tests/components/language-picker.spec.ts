import { describe, expect, it, beforeEach } from 'vitest';

import { languages } from '@delendai/shared/i18n';

import {
	readInitialLang,
	renderLanguagePicker,
	writeLang,
} from '../../src/components/language-picker';

// Minimal in-memory localStorage shim for the `node` vitest env.
const memStore = new Map<string, string>();
const localStorageShim: Storage = {
	getItem(k: string): string | null {
		return memStore.has(k) ? (memStore.get(k) ?? null) : null;
	},
	setItem(k: string, v: string): void {
		memStore.set(k, v);
	},
	removeItem(k: string): void {
		memStore.delete(k);
	},
	clear(): void {
		memStore.clear();
	},
	key(index: number): string | null {
		return Array.from(memStore.keys())[index] ?? null;
	},
	get length(): number {
		return memStore.size;
	},
};

beforeEach(() => {
	memStore.clear();
	(globalThis as unknown as { localStorage: Storage }).localStorage =
		localStorageShim;
});

describe('language-picker', async () => {
	it('renderLanguagePicker renders a <select> with all 12 languages', async () => {
		const html = renderLanguagePicker({
			current: 'en',
			languages,
			// a00083 F23: ariaLabel is required and must come from i18n.
			ariaLabel: 'Language',
		});
		expect(html).toContain('data-delendai-lang');
		expect(html).toContain('value="en"');
		expect(html).toContain('value="es"');
		expect(html).toContain('value="zh"');
		// 12 languages total
		const matches = html.match(/<option /g);
		expect(matches?.length).toBe(12);
	});

	it('marks the current language as selected', async () => {
		const html = renderLanguagePicker({
			current: 'es',
			languages,
			ariaLabel: 'Idioma',
		});
		expect(html).toContain('value="es" selected');
		expect(html).not.toContain('value="en" selected');
		expect(html).toContain('aria-label="Idioma"');
	});

	it('throws when rendered without ariaLabel (a00083 F23)', () => {
		expect(() =>
			renderLanguagePicker({ current: 'en', languages }),
		).toThrow(/ariaLabel/);
	});

	it('readInitialLang returns the stored value when valid', async () => {
		localStorage.setItem('delendai:lang', 'fr');
		expect(readInitialLang(languages)).toBe('fr');
		localStorage.removeItem('delendai:lang');
	});

	it('readInitialLang falls back to en when no stored value', async () => {
		localStorage.removeItem('delendai:lang');
		expect(readInitialLang(languages, 'en')).toBe('en');
	});

	it('readInitialLang ignores invalid stored values', async () => {
		localStorage.setItem('delendai:lang', 'klingon');
		expect(readInitialLang(languages, 'en')).toBe('en');
		localStorage.removeItem('delendai:lang');
	});

	it('writeLang persists to localStorage', async () => {
		writeLang('de');
		expect(localStorage.getItem('delendai:lang')).toBe('de');
		localStorage.removeItem('delendai:lang');
	});
});
