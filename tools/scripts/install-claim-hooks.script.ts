import { copyFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const GIT_DIR = join(ROOT, '.git');

if (!existsSync(GIT_DIR)) {
	console.log('install-claim-hooks: No .git directory found. Skipping hook installation.');
	process.exit(0);
}

const HOOKS_DIR = join(GIT_DIR, 'hooks');
if (!existsSync(HOOKS_DIR)) {
	mkdirSync(HOOKS_DIR, { recursive: true });
}

const sourcePreCommit = join(ROOT, 'tools/scripts/hooks/pre-commit.ts');
const targetPreCommit = join(HOOKS_DIR, 'pre-commit');

const sourcePrePush = join(ROOT, 'tools/scripts/hooks/pre-push.ts');
const targetPrePush = join(HOOKS_DIR, 'pre-push');

try {
	copyFileSync(sourcePreCommit, targetPreCommit);
	chmodSync(targetPreCommit, 0o755);
	console.log('install-claim-hooks: Installed pre-commit hook.');
} catch (e) {
	console.error('install-claim-hooks: Failed to install pre-commit hook:', e);
}

try {
	copyFileSync(sourcePrePush, targetPrePush);
	chmodSync(targetPrePush, 0o755);
	console.log('install-claim-hooks: Installed pre-push hook.');
} catch (e) {
	console.error('install-claim-hooks: Failed to install pre-push hook:', e);
}
