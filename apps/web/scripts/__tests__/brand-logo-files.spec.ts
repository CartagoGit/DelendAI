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
import { refreshLogos } from '../lib/brand-logo-refresh';

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

describe('refreshLogos', () => {
	const run = async (
		body: (url: string) => Response,
		cached: Record<string, string>,
	) => {
		const dir = mkdtempSync(join(tmpdir(), 'logos-'));
		dirs.push(dir);
		for (const [name, content] of Object.entries(cached)) {
			writeFileSync(join(dir, name), content);
		}
		const fake = ((url: string) =>
			Promise.resolve(body(url))) as typeof fetch;
		await refreshLogos(
			[
				{ outName: 'a', sources: ['https://x/a.svg'] },
				{ outName: 'b', sources: ['https://x/b.svg'] },
			],
			dir,
			fake,
		);
		return dir;
	};

	it('keeps the cached logo when the source is unreachable or serves HTML', async () => {
		const dir = await run(
			(url) =>
				url.endsWith('a.svg')
					? new Response('<html>502</html>')
					: new Response('nope', { status: 500 }),
			{ 'a.svg': '<svg>old-a</svg>', 'b.svg': '<svg>old-b</svg>' },
		);
		expect(readFileSync(join(dir, 'a.svg'), 'utf8')).toBe(
			'<svg>old-a</svg>',
		);
		expect(readFileSync(join(dir, 'b.svg'), 'utf8')).toBe(
			'<svg>old-b</svg>',
		);
	});

	it('replaces a cached logo with a fresh SVG and reports unchanged ones', async () => {
		const dir = await run(
			(url) =>
				new Response(
					url.endsWith('a.svg')
						? '<svg>new-a</svg>'
						: '<svg>old-b</svg>',
				),
			{ 'a.svg': '<svg>old-a</svg>', 'b.svg': '<svg>old-b</svg>' },
		);
		expect(readFileSync(join(dir, 'a.svg'), 'utf8')).toBe(
			'<svg>new-a</svg>',
		);
		expect(readFileSync(join(dir, 'b.svg'), 'utf8')).toBe(
			'<svg>old-b</svg>',
		);
	});

	it('removes a stale logo of another extension once the brand refreshed', async () => {
		const dir = await run(() => new Response('<svg/>'), { 'a.png': 'x' });
		expect(readdirSync(dir)).not.toContain('a.png');
		expect(readdirSync(dir)).toContain('a.svg');
	});

	it('survives a rejecting fetch', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'logos-'));
		dirs.push(dir);
		const boom = (() => Promise.reject(new Error('down'))) as typeof fetch;
		await refreshLogos(
			[{ outName: 'a', sources: ['https://x/a'] }],
			dir,
			boom,
		);
		expect(readdirSync(dir)).toEqual(['.gitkeep']);
	});
});
