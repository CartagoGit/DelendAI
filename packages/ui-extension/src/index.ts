/**
 * `apps/ide` package entrypoint. Re-exports the public surface so
 * `@delendai/ide` resolves to the same surface as
 * `@delendai/ide/public`. Internal modules (the `FakeHostAdapter`,
 * etc.) are not re-exported.
 */
export * from './public/index';
