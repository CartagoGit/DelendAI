/**
 * Vitest `globalSetup` for the `apps-web` project. `plugin-catalog.ts`
 * unconditionally imports `#MANIFESTS/capabilities.json` (a gitignored,
 * generated file — see `.gitignore`). `gen-capabilities.ts` already
 * stubs it on a fresh checkout so `bun run dev` never crashes; nothing
 * previously triggered that generator before the test run itself, so a
 * fresh worktree/CI checkout that runs `bun run test` (or `vitest`)
 * without first running `apps/web`'s own `bun run build`/`dev` hits
 * `Cannot find module '#MANIFESTS/capabilities.json'` instead of ever
 * reaching the intended stub. Generate it here, once, before any spec
 * in this project imports `plugin-catalog.ts` — skip if already present
 * so a local `bun run dev` session (which keeps it fresh) isn't
 * penalized by a redundant regenerate on every test run.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');
const capabilitiesPath = join(webRoot, 'src/data/manifests/capabilities.json');

export default function setup(): void {
	if (existsSync(capabilitiesPath)) return;
	const result = spawnSync('bun', ['run', 'gen:capabilities'], {
		cwd: webRoot,
		stdio: 'inherit',
	});
	if (result.status !== 0) {
		throw new Error(
			`ensure-manifests globalSetup: gen:capabilities exited ${result.status}`,
		);
	}
}
