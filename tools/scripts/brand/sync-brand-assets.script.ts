#!/usr/bin/env bun
/**
 * sync-brand-assets.script.ts — f00047 S4 (brand asset provenance).
 *
 * Walks `apps/shared/brand/` (the single source of truth) and copies
 * every SVG into:
 *   - `apps/web/public/` (for the docs site)
 *   - `extensions/vscode/media/` (for the VS Code host)
 *   - any other `extensions/<host>/media/` that already exists
 *     (future-proof: jetbrains, zed, cursor, etc. just by adding the
 *     folder; the script will pick it up automatically)
 *
 * Idempotent: re-running produces identical bytes. Uses
 * `withFileMutex` per destination so two agents cannot race a partial
 * write. Wired into `package.json#scripts.build` so `bun run build`
 * always syncs the brand before compiling the host bundles.
 *
 * Exit codes:
 *   0 — every source asset was copied (or already byte-identical) to
 *       every destination.
 *   1 — a source asset is missing in `apps/shared/brand/`, or a copy
 *       failed. The errors are reported as a JSON array on stdout.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withFileMutex } from '@mcp-vertex/core/public';

const REPO_ROOT = process.cwd();
const SOURCE_DIR = resolve(REPO_ROOT, 'apps/shared/brand');

const STATIC_DESTINATIONS: readonly string[] = [
	resolve(REPO_ROOT, 'apps/web/public'),
];

const DYNAMIC_DESTINATIONS = async (): Promise<readonly string[]> => {
	const extDir = resolve(REPO_ROOT, 'extensions');
	const entries = await readdir(extDir, { withFileTypes: true });
	return entries
		.filter((e) => e.isDirectory())
		.map((e) => resolve(extDir, e.name, 'media'));
};

const isSvg = (name: string): boolean => name.endsWith('.svg');

interface ICopyReport {
	readonly src: string;
	readonly dst: string;
	readonly changed: boolean;
	readonly bytes: number;
}

interface IOutcome {
	readonly copied: readonly ICopyReport[];
	readonly missing: readonly string[];
	readonly errors: readonly string[];
}

const copyOne = async (src: string, dst: string): Promise<ICopyReport> => {
	const bytes = await readFile(src);
	return withFileMutex(dst, async () => {
		let changed = true;
		try {
			const existing = await readFile(dst);
			changed =
				existing.length !== bytes.length || !existing.equals(bytes);
		} catch {
			// dst doesn't exist yet.
		}
		if (changed) await writeFile(dst, bytes);
		return { src, dst, changed, bytes: bytes.length };
	});
};

const main = async (): Promise<number> => {
	const sources = (await readdir(SOURCE_DIR).catch(() => []))
		.filter(isSvg)
		.map((n) => resolve(SOURCE_DIR, n));

	if (sources.length === 0) {
		const err = `no SVG sources found under ${SOURCE_DIR}`;
		console.log(
			JSON.stringify({ copied: [], missing: [], errors: [err] }, null, 2),
		);
		return 1;
	}

	const dynDest = await DYNAMIC_DESTINATIONS();
	const allDest = [...STATIC_DESTINATIONS, ...dynDest];

	const copied: ICopyReport[] = [];
	const errors: string[] = [];
	for (const dst of allDest) {
		for (const src of sources) {
			try {
				const report = await copyOne(
					src,
					join(dst, src.split('/').pop() ?? ''),
				);
				copied.push(report);
			} catch (e) {
				errors.push(`${src} → ${dst}: ${(e as Error).message}`);
			}
		}
	}

	const missing = sources
		.filter((s) => !copied.some((c) => c.src === s))
		.map((s) => s);

	const outcome: IOutcome = { copied, missing, errors };
	console.log(JSON.stringify(outcome, null, 2));
	return errors.length === 0 && missing.length === 0 ? 0 : 1;
};

const code = await main();
process.exit(code);
