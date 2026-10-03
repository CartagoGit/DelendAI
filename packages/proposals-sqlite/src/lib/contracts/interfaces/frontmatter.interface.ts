/** A scalar in a proposal's frontmatter, as YAML reads it. */
export type IYamlScalar = string | number | boolean | null;

/**
 * A parsed YAML value — scalar, array, or plain object. The recursive
 * type is intentional; YAML values can be arbitrarily nested.
 */
export type IYamlValue =
	| IYamlScalar
	| IYamlValue[]
	| { [k: string]: IYamlValue };

export interface IParsedFrontmatter {
	readonly value: Readonly<Record<string, IYamlValue>>;
	/** Why YAML refused the block, when `value` came from the fallback. */
	readonly error?: string;
}
