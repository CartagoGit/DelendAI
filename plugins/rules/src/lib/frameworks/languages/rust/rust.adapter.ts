import type { IFileReader } from '@mcp-vertex/core/public';

import type { ILanguageAdapter } from '../../contracts';

import { rustCommandSetProvider } from './rust-command.provider';

/**
 * Rust language adapter. Detects Rust via `Cargo.toml` and brings
 * its own `ICommandSetProvider` (cargo/clippy) so the registry
 * does not need a default.
 *
 * Open/Closed: this file is the only place that knows about
 * Rust. Adding a new language = adding one such file; the
 * detector, registry, and manifest writer never change.
 *
 * Single Responsibility: detect Rust + delegate to the cargo
 * command provider. Nothing else.
 *
 * Priority 20 — beats the JS/TS catch-all (priority 50) so a
 * `Cargo.toml` in a polyglot dir with both `package.json` and
 * `Cargo.toml` resolves to Rust. The proposal's priority model.
 */
export const rustAdapter: ILanguageAdapter = {
	id: 'rs',
	priority: 20,
	commands: rustCommandSetProvider,
	detect(reader: IFileReader, areaDir: string) {
		if (reader.exists(`${areaDir}/Cargo.toml`)) {
			return {
				presetId: 'rust-clippy',
				reason: 'Rust (Cargo.toml)',
			};
		}
		return undefined;
	},
};
