import type { IDogmaAdapter } from '../contracts';

/**
 * Dependency Inversion: a renderer transforms an
 * `IDogmaAdapter` into the shape the consumer needs. The
 * default renderer produces a single-line string suitable
 * for system-prompt interpolation; a future
 * `ToolUseDogmaRenderer` would emit a structured tool-use
 * hint (e.g. `{ type: 'tool_use', name: 'follow_dogma',
 * input: { ownership: 'borrow-checker', ... } }`). The
 * tools depend on the interface, not on a concrete
 * implementation.
 *
 * Single Responsibility: one renderer = one rendering
 * strategy. A tool that wants a different rendering (e.g.
 * the web docs site wants HTML, the IDE wants a code
 * action) implements a new `IDogmaRenderer` and swaps it
 * via the `DogmaRendererRegistry`.
 *
 * Open/Closed: adding a renderer = adding a file under
 * `dogmas/renderers/`. The interface never changes.
 */
export interface IRenderedDogma {
	/** The rendered payload (string for the default; structured for tool-use). */
	readonly payload: string;
	/** The renderer id that produced this output (for traceability). */
	readonly rendererId: string;
}

export interface IDogmaRenderer {
	/** Stable id (e.g. `string`, `tool-use`, `markdown`). */
	readonly id: string;
	/** Render one dogma into the consumer's shape. */
	render(dogma: IDogmaAdapter): IRenderedDogma;
}

/**
 * The default renderer. Emits a single-line string suitable
 * for system-prompt interpolation:
 *   `Rust 2024: borrow-checker ownership, Result errors,
 *    Option for null-safety, snake_case naming, no async,
 *    pub/fn visibility, let-mut default, table-driven
 *    tests. Idioms: Prefer \`?\` over \`unwrap()\`; …`
 *
 * The bullets are joined with `; ` so the whole thing fits
 * on one line and the LLM can read it as a single sentence.
 */
export const stringDogmaRenderer: IDogmaRenderer = {
	id: 'string',
	render(dogma) {
		const head = `${labelOf(dogma)}: ${dim(dogma, 'ownership')} ownership, ${dim(dogma, 'errorModel')} errors, ${dim(dogma, 'nullSafety')} for null-safety, ${dim(dogma, 'naming')} naming, ${dim(dogma, 'async')} async, ${dim(dogma, 'visibility')} visibility, ${dim(dogma, 'immutability')} default, ${dim(dogma, 'testing')} tests.`;
		const tail =
			dogma.bullets.length > 0
				? ` Idioms: ${dogma.bullets.join('; ')}.`
				: '';
		return {
			payload: `${head}${tail}`,
			rendererId: 'string',
		};
	},
};

const labelOf = (d: IDogmaAdapter): string =>
	`${d.language} (${d.packageManager}, ${d.version})`;

type DimKey =
	| 'ownership'
	| 'errorModel'
	| 'nullSafety'
	| 'naming'
	| 'async'
	| 'visibility'
	| 'immutability'
	| 'testing';

const dim = (d: IDogmaAdapter, k: DimKey): string => String(d[k]);

/**
 * Registry of renderers. Dependency Inversion: a consumer
 * (tool, skill) takes a `DogmaRendererRegistry` via
 * constructor injection and resolves the renderer it wants
 * by id. Adding a renderer = adding a file under
 * `dogmas/renderers/` + one entry in the registry; nothing
 * else changes.
 */
export class DogmaRendererRegistry {
	readonly #byId: ReadonlyMap<string, IDogmaRenderer>;
	#defaultId: string;

	constructor(
		renderers: readonly IDogmaRenderer[],
		defaultId: string = 'string',
	) {
		this.#byId = new Map(renderers.map((r) => [r.id, r]));
		if (!this.#byId.has(defaultId)) {
			throw new Error(
				`DogmaRendererRegistry: default id "${defaultId}" not in renderers [${[...this.#byId.keys()].join(', ')}]`,
			);
		}
		this.#defaultId = defaultId;
	}

	/** Look up a renderer by id; falls back to the default. */
	resolve(id?: string): IDogmaRenderer {
		if (id === undefined) {
			const r = this.#byId.get(this.#defaultId);
			if (r === undefined) {
				throw new Error(
					`DogmaRendererRegistry: default renderer "${this.#defaultId}" missing`,
				);
			}
			return r;
		}
		const r = this.#byId.get(id) ?? this.#byId.get(this.#defaultId);
		if (r === undefined) {
			throw new Error(
				`DogmaRendererRegistry: no renderer for id "${id}" and no default`,
			);
		}
		return r;
	}
}
