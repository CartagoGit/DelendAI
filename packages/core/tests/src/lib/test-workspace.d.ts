/**
 * Assembly now creates runtime evidence below the workspace cache. Tests
 * that exercise assembly must therefore use a real writable workspace,
 * rather than the historical placeholder paths (`/ws`, `/workspace`).
 */
export declare const createTestWorkspace: (prefix: string) => string;
export declare const removeTestWorkspace: (workspace: string) => void;
