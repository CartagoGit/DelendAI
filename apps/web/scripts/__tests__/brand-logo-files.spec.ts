import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	isSvg,
	replaceFile,
	sniff,
	staleLogoFiles,
} from '../lib/brand-logo-files';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('sniff', () => {
	it('accepts SVG with or without a prolog', () => {
		expect(sniff(bytes('<svg xmlns="x"/>'))).toBe('svg');
		expect(sniff(bytes('﻿<?xml version="1.0"?>\n<!-- c -->\n<svg>'))).toBe(
			'svg',
		);
	});
	it('rejects an HTML gateway page that starts with <', () => {
		expect(
			isSvg(bytes('<!DOCTYPE html><html><body>502</body></html>')),
		).toBe(false);
		expect(sniff(bytes('<html><svg></svg></html>'))).toBeNull();
	});
	it('still recognises PNG and ICO', () => {
		expect(
			sniff(
				Uint8Array.from([
					0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
				]),
			),
		).toBe('png');
		expect(sniff(Uint8Array.from([0, 0, 1, 0, 9]))).toBe('ico');
	});
});

describe('replaceFile', () => {
	it('replaces the content and leaves no temp file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'logos-'));
		dirs.push(dir);
		const path = join(dir, 'npm.svg');
		writeFileSync(path, 'old');
		replaceFile(path, bytes('<svg/>'));
		expect(readFileSync(path, 'utf8')).toBe('<svg/>');
		expect(readdirSync(dir)).toEqual(['npm.svg']);
	});
});

describe('staleLogoFiles', () => {
	it('keeps the cached logo of a brand whose fetch failed', () => {
		const files = ['npm.svg', 'github.svg', 'github.png'];
		expect(
			staleLogoFiles(files, new Set(['github']), new Set(['github.png'])),
		).toEqual(['github.svg']);
	});
});
