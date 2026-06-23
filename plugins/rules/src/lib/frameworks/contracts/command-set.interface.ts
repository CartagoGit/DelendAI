/**
 * The 3-field tuple every `ICommandSetProvider` produces.
 *
 * Single Responsibility: a command set is just the three commands
 * the agent needs to lint, fix, and typecheck one area. Nothing
 * else. `check_rules`, `apply_rules` and the new S11 `IPolicyResolver`
 * all consume only this shape.
 */
export interface ICommandSet {
	/** Human-readable linter command (e.g. `ruff check .`, `eslint apps/web`). */
	readonly checkCommand: string;
	/** Optional auto-fix command (e.g. `ruff check --fix .`, `cargo clippy --fix`). */
	readonly fixCommand?: string;
	/** Optional typecheck command (e.g. `pyright`, `tsc --noEmit -p tsconfig.json`). */
	readonly typecheckCommand?: string;
}
