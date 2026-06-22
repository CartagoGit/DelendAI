import { describe, expect, it, beforeEach } from 'vitest';

import { languages } from '@mcp-vertex/shared/i18n';

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

describe('language-picker', () => {
	it('renderLanguagePicker renders a <select> with all 12 languages', () => {
		const html = renderLanguagePicker({ current: 'en', languages });
		expect(html).toContain('data-mv-lang');
		expect(html).toContain('value="en"');
		expect(html).toContain('value="es"');
		expect(html).toContain('value="zh"');
		// 12 languages total
		const matches = html.match(/<option /g);
		expect(matches?.length).toBe(12);
	});

	it('marks the current language as selected', () => {
		const html = renderLanguagePicker({ current: 'es', languages });
		expect(html).toContain('value="es" selected');
		expect(html).not.toContain('value="en" selected');
	});

	it('readInitialLang returns the stored value when valid', () => {
		localStorage.setItem('mv:lang', 'fr');
		expect(readInitialLang(languages)).toBe('fr');
		localStorage.removeItem('mv:lang');
	});

	it('readInitialLang falls back to en when no stored value', () => {
		localStorage.removeItem('mv:lang');
		expect(readInitialLang(languages, 'en')).toBe('en');
	});

	it('readInitialLang ignores invalid stored values', () => {
		localStorage.setItem('mv:lang', 'klingon');
		expect(readInitialLang(languages, 'en')).toBe('en');
		localStorage.removeItem('mv:lang');
	});

	it('writeLang persists to localStorage', () => {
		writeLang('de');
		expect(localStorage.getItem('mv:lang')).toBe('de');
		localStorage.removeItem('mv:lang');
	});
});
