/**
 * land-forward.ts — the integrator's git moves now live in the integration
 * plugin; this keeps the scratch directory the derived-file jobs use and
 * the names this repository's scripts import.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createBringForward,
	identityPushEnv,
	plainMerge,
	runGit,
} from '@delendai/integration/public';

/** A scratch directory the caller removes with `rmSync`. */
export const scratchDir = (): string =>
	mkdtempSync(join(tmpdir(), 'delendai-derived-'));

export const removeScratch = (dir: string): void =>
	rmSync(dir, { recursive: true, force: true });

export { createBringForward, identityPushEnv, plainMerge, runGit };
