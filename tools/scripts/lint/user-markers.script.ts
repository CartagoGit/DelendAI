#!/usr/bin/env bun
/**
 * user-markers.script.ts — proposal f00071 S7.
 *
 * CI lint that the host's declared close-markers (under
 * `plugins.status-marker.options.markers` in `mcp-vertex.config.json`)
 * collide cleanly with the built-ins. A host that adds a `REVIEW` marker
 * but reuses a built-in emoji (or disables the floor state `HECHO`) would
 * otherwise only discover the misconfiguration when the plugin throws at
 * boot. This lint surfaces it in `bun run validate` instead.
 *
 * The check is two-phase:
 *   1. Schema: parse the `markers` block with the plugin's own
 *      `UserMarkerConfigSchema`. A malformed block (bad `id` casing,
 *      empty emoji, …) fails here.
 *   2. Merge: run the plugin's pure `mergeMarkerTable`. Emoji/id
 *      collisions, disabling `HECHO`, overriding an unknown state, etc.
 *      surface as the same structured error the plugin would throw.
 *
 * When the repo config declares no `markers` block (the common case), the
 * lint is a no-op success — there is nothing to collide.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	mergeMarkerTable,
	type IMergeError,
} from '../../../plugins/status-marker/src/lib/markers';
import { UserMarkerConfigSchema } from '../../../plugins/status-marker/src/lib/markers-config';
import { repoRoot } from '../lib/monorepo-paths';

/** Outcome of linting one host config. */
export interface IUserMarkersLintResult {
	readonly ok: boolean;
	/** `true` when the config declared a `markers` block at all. */
	readonly declared: boolean;
	/** Effective state count after a clean merge (built-ins ± config). */
	readonly stateCount?: number;
	/** Human-readable failure reason when `ok` is false. */
	readonly error?: string;
}

/**
 * Lint a parsed `mcp-vertex.config.json` object. Pure: no I/O, so tests
 * can pass a literal. Reads only `plugins.status-marker.options.markers`.
 */
export const lintUserMarkers = (
	config: unknown,
): IUserMarkersLintResult => {
	const markersBlock = readMarkersBlock(config);
	if (markersBlock === undefined) {
		return { ok: true, declared: false };
	}

	const parsed = UserMarkerConfigSchema.safeParse(markersBlock);
	if (!parsed.success) {
		return {
			ok: false,
			declared: true,
			error: `markers block fails the schema: ${formatZodIssue(parsed.error)}`,
		};
	}

	const merged = mergeMarkerTable(parsed.data);
	if (isMergeError(merged)) {
		return {
			ok: false,
			declared: true,
			error: merged.error,
		};
	}

	return { ok: true, declared: true, stateCount: merged.states.length };
};

/** Pull the `markers` block out of an arbitrary config object, if present. */
const readMarkersBlock = (config: unknown): unknown => {
	if (typeof config !== 'object' || config === null) return undefined;
	const plugins = (config as Record<string, unknown>).plugins;
	if (typeof plugins !== 'object' || plugins === null) return undefined;
	const sm = (plugins as Record<string, unknown>)['status-marker'];
	if (typeof sm !== 'object' || sm === null) return undefined;
	const options = (sm as Record<string, unknown>).options;
	if (typeof options !== 'object' || options === null) return undefined;
	return (options as Record<string, unknown>).markers;
};

const isMergeError = (value: unknown): value is IMergeError =>
	typeof value === 'object' &&
	value !== null &&
	'ok' in value &&
	(value as { ok: unknown }).ok === false;

/** Best-effort one-line summary of a Zod error for the CLI. */
const formatZodIssue = (error: unknown): string => {
	const issues = (error as { issues?: Array<{ message?: string }> }).issues;
	if (Array.isArray(issues) && issues.length > 0) {
		return issues.map((i) => i.message ?? 'invalid').join('; ');
	}
	return String(error);
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const configPath = join(root, 'mcp-vertex.config.json');
		const raw = await readFile(configPath, 'utf8').catch(() => undefined);
		if (raw === undefined) {
			console.log(
				'✓ user-markers: no mcp-vertex.config.json — nothing to lint.',
			);
			return;
		}
		let config: unknown;
		try {
			config = JSON.parse(raw);
		} catch (err) {
			console.error(
				`✖ user-markers: mcp-vertex.config.json is not valid JSON: ${String(err)}`,
			);
			process.exit(1);
		}

		const result = lintUserMarkers(config);
		if (!result.ok) {
			console.error(
				`✖ user-markers: status-marker markers config is invalid — ${result.error}`,
			);
			console.error(
				'  fix: ensure added emojis/ids are unique vs the built-ins, do not disable HECHO, and only override known states.',
			);
			process.exit(1);
		}
		if (result.declared) {
			console.log(
				`✓ user-markers: status-marker markers config merges cleanly (${result.stateCount} effective states).`,
			);
		} else {
			console.log(
				'✓ user-markers: no status-marker markers declared — nothing to collide.',
			);
		}
	})();
}
