/**
 * hermetic-cwd-setup.ts — vitest setup file: every spec runs from the
 * repository root, wherever the run was started.
 *
 * The workspace run starts at the root, and specs were written against it
 * (`packages/core/src/...` read as a relative path). Started from inside a
 * package (`cd packages/core && vitest run`), the same specs failed on
 * those paths, and code under test that writes the canonical cache wrote
 * a second one under the package (`packages/core/.cache/delendai`), which
 * `lint:cache` then refused. Fixing the directory here gives one answer
 * for both ways of running.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

try {
	if (process.cwd() !== repositoryRoot) process.chdir(repositoryRoot);
} catch {
	// A worker thread cannot change directory; its run started at the root.
}
