import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Assembly now creates runtime evidence below the workspace cache. Tests
 * that exercise assembly must therefore use a real writable workspace,
 * rather than the historical placeholder paths (`/ws`, `/workspace`).
 */
export const createTestWorkspace = (prefix: string): string =>
	mkdtempSync(join(tmpdir(), prefix));

export const removeTestWorkspace = (workspace: string): void => {
	rmSync(workspace, { recursive: true, force: true });
};
