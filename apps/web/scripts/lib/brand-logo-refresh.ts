/**
 * brand-logo-refresh.ts — the fetch-and-replace loop of
 * `fetch-brand-logos.ts`, with the output directory and `fetch` injected so
 * a spec can drive it without the network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
	extensionForKind,
	replaceFile,
	sniff,
	staleLogoFiles,
} from './brand-logo-files';

export const fetchUrl = async (
	url: string,
	fetchFn: typeof fetch = fetch,
): Promise<{
	body: Uint8Array;
	kind: NonNullable<ReturnType<typeof sniff>>;
	bytes: number;
} | null> => {
	try {
		const res = await fetchFn(url, {
			redirect: 'follow',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
				// Bun's fetch auto-decompresses gzip bodies, so we
				// arrive at the raw bytes regardless of the
				// upstream's Content-Encoding.
				Accept: 'image/svg+xml,image/png,image/webp,image/*,*/*;q=0.8',
			},
		});
		if (!res.ok) return null;
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength === 0) return null;
		const kind = sniff(buf);
		if (!kind) {
			console.warn(
				`  ${url} → magic bytes ${Array.from(buf.slice(0, 8))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join(' ')}, skipping (likely HTML/gzip redirect)`,
			);
			return null;
		}
		return { body: buf, kind, bytes: buf.byteLength };
	} catch (e) {
		console.warn(`  ${url} → ${(e as Error).message}`);
		return null;
	}
};

export const refreshLogos = async (
	brands: ReadonlyArray<{ outName: string; sources: ReadonlyArray<string> }>,
	OUT: string,
	fetchFn: typeof fetch = fetch,
): Promise<void> => {
	mkdirSync(OUT, { recursive: true });
	let fetched = 0;
	let written = 0;
	let failed = 0;
	const writtenThisRun = new Set<string>();
	const refreshedBases = new Set<string>();

	for (const brand of brands) {
		let hit: {
			body: Uint8Array;
			kind: NonNullable<ReturnType<typeof sniff>>;
			bytes: number;
		} | null = null;
		for (const url of brand.sources) {
			hit = await fetchUrl(url, fetchFn);
			if (hit) break;
		}
		if (!hit) {
			console.warn(
				`FAILED ${brand.outName} (no source responded with an image)`,
			);
			failed += 1;
			continue;
		}
		fetched += 1;
		refreshedBases.add(brand.outName);
		const outName = `${brand.outName}.${extensionForKind(hit.kind)}`;
		const outPath = join(OUT, outName);
		// Read once, no existence check first: the two could see different files.
		let existing: Buffer | null;
		try {
			existing = readFileSync(outPath);
		} catch {
			existing = null;
		}
		// a00084 F35: byteLength alone treats two DIFFERENT logos that happen
		// to share a byte count as "unchanged", silently keeping the stale
		// cached asset. Buffer#equals compares actual content.
		if (existing?.equals(hit.body)) {
			console.log(`unchanged ${outName} (${hit.bytes}B)`);
			writtenThisRun.add(outName);
			continue;
		}
		replaceFile(outPath, hit.body);
		written += 1;
		writtenThisRun.add(outName);
		console.log(`wrote ${outName} (${hit.bytes}B, ${hit.kind})`);
	}

	// Remove any stale logo file with the same `<base>` but a
	// different extension than what we wrote this run. e.g. if
	// the previous x128 attempt left `github.svg` (from simple-
	// icons) and this run downloaded the real `github.png`,
	// the .svg gets deleted. The `<base>.<ext>` we want is the
	// one in `writtenThisRun`; everything else matching a brand
	// base is stale.
	// A brand whose fetch failed keeps its cached logo (WEB-ASSET01).
	for (const file of staleLogoFiles(
		await readdir(OUT),
		refreshedBases,
		writtenThisRun,
	)) {
		console.log(`removing stale ${file}`);
		await unlink(join(OUT, file));
	}

	if (!existsSync(join(OUT, '.gitkeep'))) {
		writeFileSync(join(OUT, '.gitkeep'), '');
	}

	console.log(
		`fetch-brand-logos: ${brands.length} brands — ${fetched} fetched, ${written} (re)written, ${failed} failed`,
	);
};
