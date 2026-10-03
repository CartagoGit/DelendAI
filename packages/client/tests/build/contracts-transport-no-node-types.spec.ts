/**
 * r00041 S3 — `client/contracts` and `client/transport` must compile
 * for a consumer that has no Node types at all.
 *
 * ## Why this exists next to S1's boundary spec
 *
 * S1 already forbids `node:*` and `@delendai/core` import specifiers
 * outside `src/node/`, and that spec is the cheap first line. It cannot
 * see the other half of the problem: ambient globals. `chunk: Buffer`,
 * `NodeJS.Timeout`, a bare `process.env` — none of those are imports, so
 * a specifier scan reports the file clean while a consumer without
 * `@types/node` fails to compile it.
 *
 * That is not hypothetical. `mcp-stdio-client.ts` annotated a stderr
 * callback parameter as `Buffer | string` and sat inside `transport/`
 * passing S1 the whole time; only this compile found it.
 *
 * The check is a real `tsc` run rather than another text scan, because
 * reproducing "a consumer without `@types/node`" is precisely what a
 * compiler invocation with `"types": []` does and what no regex can.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const workspaceRoot = resolve(clientRoot, '../..');

const PROJECT = 'packages/client/tsconfig.contracts.json';

describe('client/contracts + client/transport are library-safe', () => {
	it('compiles with no @types/node on the classpath', () => {
		const run = spawnSync('bunx', ['tsc', '-p', PROJECT], {
			cwd: workspaceRoot,
			encoding: 'utf8',
		});
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		// Report the diagnostics themselves, not just a status code: a
		// failure here names the exact file and the exact ambient global,
		// which is the whole value of running the compiler.
		expect(output).not.toMatch(/error TS/u);
		expect(run.status).toBe(0);
	}, 180_000);

	it('declares the two subpaths it just proved safe', async () => {
		const manifest = (await import(`${clientRoot}/package.json`, {
			with: { type: 'json' },
		})) as {
			readonly default: { readonly exports: Record<string, unknown> };
		};
		// A tsconfig that compiles a barrel nobody can import proves
		// nothing; the guarantee is only real once it is reachable.
		expect(Object.keys(manifest.default.exports)).toEqual(
			expect.arrayContaining(['./contracts', './transport']),
		);
	});
});
