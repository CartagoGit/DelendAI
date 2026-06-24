import type { IDogmaAdapter } from '../contracts';

import { CSHARP_DOGMA } from './csharp.dogma';
import { ELIXIR_DOGMA } from './elixir.dogma';
import { GO_DOGMA } from './go.dogma';
import { JAVA_DOGMA } from './java.dogma';
import { KOTLIN_DOGMA } from './kotlin.dogma';
import { PYTHON_DOGMA } from './python.dogma';
import { RUBY_DOGMA } from './ruby.dogma';
import { RUST_DOGMA } from './rust.dogma';
import { SWIFT_DOGMA } from './swift.dogma';

export {
	stringDogmaRenderer,
	DogmaRendererRegistry,
	type IDogmaRenderer,
	type IRenderedDogma,
} from './renderer';

/**
 * Barrel + composition root for dogma adapters.
 *
 * Dependency Inversion: `DogmaRegistry` consumes this. Adding a
 * new language = adding one file under `dogmas/<lang>.dogma.ts`
 * and one entry here. The registry / tools / manifest writer
 * never change.
 *
 * Single Responsibility: this file's only job is to list every
 * `IDogmaAdapter` shipped with the plugin. It does not transform,
 * filter, or compose them.
 *
 * f00051 S3: the priority families (Rust + Python, Go, Ruby, Java,
 * Kotlin, Swift, C#, Elixir) ship here. The ~60 long-tail languages
 * land in a later slice.
 */
export const DEFAULT_DOGMA_ADAPTERS: readonly IDogmaAdapter[] = [
	RUST_DOGMA,
	PYTHON_DOGMA,
	GO_DOGMA,
	RUBY_DOGMA,
	JAVA_DOGMA,
	KOTLIN_DOGMA,
	SWIFT_DOGMA,
	CSHARP_DOGMA,
	ELIXIR_DOGMA,
];

export {
	RUST_DOGMA,
	PYTHON_DOGMA,
	GO_DOGMA,
	RUBY_DOGMA,
	JAVA_DOGMA,
	KOTLIN_DOGMA,
	SWIFT_DOGMA,
	CSHARP_DOGMA,
	ELIXIR_DOGMA,
};
