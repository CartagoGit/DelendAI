/**
 * blueprint-cachedir.spec.ts (M15/H5)
 *
 * The server blueprint must land under the SAME resolved cacheDir as the rest
 * of the store — including when cacheDir comes from the config file (no CLI
 * flag). Previously it re-derived from the CLI flag only and drifted to the
 * default `.cache/delendai`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { prepareServerBlueprintOnStart } from '@delendai/core/lib/cli/run-cli';

describe('prepareServerBlueprintOnStart cacheDir (M15/H5)', async () => {
	let ws = '';
	beforeEach(() => {
		ws = mkdtempSync(join(tmpdir(), 'bp-cache-'));
	});
	afterEach(() => rmSync(ws, { recursive: true, force: true }));

	it('writes under the resolved cacheDir (e.g. from config), not the default', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state');
		expect(res.written).toBe(true);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('falls back to the default cacheDir when none is resolved', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args);
		expect(res.path).toBe('.cache/delendai/bootstrap/blueprint.json');
	});

	it('collapses trailing slashes in the resolved cacheDir path', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state///');
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('handles a long trailing slash run in cacheDir quickly', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const started = Date.now();
		const res = await prepareServerBlueprintOnStart(
			args,
			`build/state${'/'.repeat(40_000)}`,
		);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});
