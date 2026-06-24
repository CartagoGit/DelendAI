import type { IRulePreset } from '../../contracts';

import { CSHARP_PRESET } from './csharp';
import { ELIXIR_PRESET } from './elixir';
import { GO_PRESET } from './go';
import { JAVA_PRESET } from './java';
import { KOTLIN_PRESET } from './kotlin';
import { PYTHON_PRESET } from './python';
import { RUBY_PRESET } from './ruby';
import { RUST_PRESET } from './rust';
import { SWIFT_PRESET } from './swift';

/**
 * Composition root for the plugin's preset DATA.
 *
 * Single Responsibility: this file's only job is to list every
 * preset shipped today. The `data/<lang>.ts` files are DATA
 * only (no logic); this file is the only place that knows the
 * full set.
 *
 * Adding a preset: add one entry in `data/<lang>.ts`, then add
 * one line here. The `PresetRegistry` consumes this list; no
 * other file changes.
 *
 * f00051 S3: the priority families (Rust + Python, Go, Ruby,
 * Java, Kotlin, Swift, C#, Elixir) ship here. The ~60 long-tail
 * languages land in a later slice.
 */
export const ALL_PRESET_DATA: readonly IRulePreset[] = [
	RUST_PRESET,
	PYTHON_PRESET,
	GO_PRESET,
	RUBY_PRESET,
	JAVA_PRESET,
	KOTLIN_PRESET,
	SWIFT_PRESET,
	CSHARP_PRESET,
	ELIXIR_PRESET,
];

export {
	RUST_PRESET,
	PYTHON_PRESET,
	GO_PRESET,
	RUBY_PRESET,
	JAVA_PRESET,
	KOTLIN_PRESET,
	SWIFT_PRESET,
	CSHARP_PRESET,
	ELIXIR_PRESET,
};
