#!/usr/bin/env bun
import { existsSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVsCodeExtension } from './build';

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCH_ROOTS = [
	join(EXTENSION_ROOT, 'src'),
	join(EXTENSION_ROOT, '..', 'client', 'src'),
	join(EXTENSION_ROOT, '..', 'ui-extension', 'src'),
];
const DEBOUNCE_MS = 150;

const directoriesUnder = (root: string): string[] => {
	if (!existsSync(root)) return [];
	const directories = [root];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		if (statSync(path).isDirectory())
			directories.push(...directoriesUnder(path));
	}
	return directories;
};

const watchers = directoriesUnder(WATCH_ROOTS[0]!).map((directory) =>
	watch(directory, scheduleRebuild),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let building = false;
let queued = false;

async function rebuild(): Promise<void> {
	if (building) {
		queued = true;
		return;
	}
	building = true;
	try {
		const result = await buildVsCodeExtension();
		if (!result.success) {
			for (const log of result.logs) console.error(log);
			return;
		}
		console.log(`[watch:vscode] rebuilt ${new Date().toISOString()}`);
	} finally {
		building = false;
		if (queued) {
			queued = false;
			void rebuild();
		}
	}
}

function scheduleRebuild(): void {
	if (timer !== undefined) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = undefined;
		void rebuild();
	}, DEBOUNCE_MS);
}

await rebuild();
for (const root of WATCH_ROOTS.slice(1)) {
	for (const directory of directoriesUnder(root)) {
		watchers.push(watch(directory, scheduleRebuild));
	}
}

console.log('[watch:vscode] watching extension and local workspace packages');
const stop = (): void => {
	for (const watcher of watchers) watcher.close();
	process.exit(0);
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await new Promise<void>(() => undefined);
