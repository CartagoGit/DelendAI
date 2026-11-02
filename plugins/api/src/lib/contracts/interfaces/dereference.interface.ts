/** A spec's `paths` with their local `$ref`s expanded. */
export interface IDereferenced {
	readonly paths: unknown;
	/** References left as empty schemas: external, broken or circular. */
	readonly unresolved: number;
}
