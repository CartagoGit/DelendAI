#!/usr/bin/env bun
/**
 * typecheck.script.ts — c00123 / a00067 S5 follow-up.
 *
 * Wrapper around `tsc --noEmit` that supports one workspace-level opt-out:
 *   MCP_VERTEX_RELAX_EXACT_OPTIONAL=1  → use tsconfig.relax.json
 *                                       (sets exactOptionalPropertyTypes: false)
 *   unset / anything else              → use tsconfig.json
 *                                       (keeps exactOptionalPropertyTypes: true,
 *                                       the default since 2026-06)
 *
 * The flag adds friction for LLMs without lifting the runtime quality bar
 * (a00067 F3 / DC5); see `docs/mcp-vertex/AGENT-BOOTSTRAP.md` for the trade
 * note (c00123 S2). On by default, opt-out only.
 *
 * Acceptance (c00123 S1):
 *   - `MCP_VERTEX_RELAX_EXACT_OPTIONAL=1 npm run typecheck` succeeds with flag off.
 *   - Default run (env unset) keeps the flag ON and the project typechecks.
 *   - `bun run validate` is unchanged.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const RELAX_ENV = 'MCP_VERTEX_RELAX_EXACT_OPTIONAL';
const DEFAULT_PROJECT = 'tsconfig.json';
const RELAXED_PROJECT = 'tsconfig.relax.json';

function resolveProject(): string {
	const value = process.env[RELAX_ENV];
	const enabled = value === '1' || value === 'true';
	const project = enabled ? RELAXED_PROJECT : DEFAULT_PROJECT;
	if (enabled) {
		console.log(
			`[typecheck] ${RELAX_ENV}=${value} → using ${project} (exactOptionalPropertyTypes: false)`,
		);
	} else {
		console.log(
			`[typecheck] ${RELAX_ENV} unset → using ${project} (exactOptionalPropertyTypes: true, default)`,
		);
	}
	return project;
}

const projectPath = resolve(REPO_ROOT, resolveProject());
const result = spawnSync('bunx', ['tsc', '--noEmit', '-p', projectPath], {
	stdio: 'inherit',
	cwd: REPO_ROOT,
});

if (result.error) {
	console.error(`[typecheck] failed to spawn tsc: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
