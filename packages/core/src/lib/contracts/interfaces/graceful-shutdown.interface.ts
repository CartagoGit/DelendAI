/**
 * Options for `gracefulShutdown`.
 *
 * Declared here rather than beside the implementation because
 * `@delendai/core/contracts` re-exports it: TypeScript type-checks the
 * whole target module to resolve a type, so re-exporting this from
 * `lib/cli/graceful-shutdown.ts` dragged that module's ambient
 * `process`/`setTimeout().unref()` usage into every consumer that
 * compiles without `@types/node` — which is exactly the audience the
 * `contracts` subpath exists to serve.
 */
export interface IGracefulShutdownOptions {
	/**
	 * How long to wait for in-flight work before forcing the exit.
	 * Defaults to 5 seconds.
	 */
	readonly timeoutMs?: number;
	/**
	 * Whether to call `process.exit` once shutdown completes. When
	 * `false` the host must exit itself, or return from `run()` and let
	 * `beforeExit` finish it.
	 */
	readonly exitProcess?: boolean;
	/**
	 * Code passed to `process.exit`. The conventional value for
	 * SIGINT/SIGTERM in shells is 128 + signal number (`130` for SIGINT,
	 * `143` for SIGTERM). Pass `0` to indicate "clean shutdown despite
	 * signal" (useful for ops automation that scrapes exit codes).
	 */
	readonly exitCode?: number;
}
