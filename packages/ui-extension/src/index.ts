/**
 * `apps/ide` package entrypoint. Re-exports the public surface so
 * `@mcp-vertex/ide` resolves to the same surface as
 * `@mcp-vertex/ide/public`. Internal modules (the `FakeHostAdapter`,
 * etc.) are not re-exported.
 */
export * from './public/index';
