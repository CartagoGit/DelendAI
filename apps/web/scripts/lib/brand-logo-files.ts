/**
 * brand-logo-files.ts — the pure parts of `fetch-brand-logos.ts`: sniff a
 * downloaded body and replace a cached logo without ever losing it.
 */
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

type ImageKind = 'svg' | 'png' | 'ico';

const BINARY_MAGIC: Record<'png' | 'ico', ReadonlyArray<number>> = {
	png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	ico: [0x00, 0x00, 0x01, 0x00],
};

/**
 * An SVG document has an `<svg` root element. A leading `<` is not enough:
 * an HTML gateway page starts with `<` too (WEB-ASSET02), so look for the
 * root element in the head of the body, after any BOM, XML prolog,
 * comments or doctype.
 */
export const isSvg = (buf: Uint8Array): boolean => {
	const head = new TextDecoder('utf-8').decode(buf.subarray(0, 2048));
	const stripped = head
		.replace(/^﻿/, '')
		.replace(/^\s+/, '')
		.replace(
			/^(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE\s+svg[\s\S]*?>\s*)+/i,
			'',
		);
	return /^<svg[\s>/]/i.test(stripped);
};

export const sniff = (buf: Uint8Array): ImageKind | null => {
	for (const kind of ['png', 'ico'] as const) {
		const sig = BINARY_MAGIC[kind];
		if (buf.byteLength >= sig.length && sig.every((b, i) => buf[i] === b)) {
			return kind;
		}
	}
	return isSvg(buf) ? 'svg' : null;
};

/**
 * Write to a sibling temp file, then rename over the target: the cached
 * logo is replaced atomically and survives a failed write (WEB-ASSET01).
 */
export const replaceFile = (path: string, body: Uint8Array): void => {
	const tmp = `${path}.${process.pid}.tmp`;
	try {
		writeFileSync(tmp, body);
		renameSync(tmp, path);
	} catch (error) {
		try {
			unlinkSync(tmp);
		} catch {
			// nothing to clean up
		}
		throw error;
	}
};

/**
 * Which cached `<base>.<ext>` files are stale: only bases that were
 * refreshed this run and now live under another extension. A brand whose
 * fetch failed keeps whatever is cached.
 */
export const staleLogoFiles = (
	files: ReadonlyArray<string>,
	refreshedBases: ReadonlySet<string>,
	writtenThisRun: ReadonlySet<string>,
): string[] =>
	files.filter((file) => {
		const m = file.match(/^(.+)\.(svg|png|ico)$/);
		const base = m?.[1];
		return (
			base !== undefined &&
			refreshedBases.has(base) &&
			!writtenThisRun.has(file)
		);
	});

export const extensionForKind = (kind: ImageKind): string => kind;
