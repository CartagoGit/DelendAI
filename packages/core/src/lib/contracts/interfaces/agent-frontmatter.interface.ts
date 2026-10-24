/**
 * One parsed frontmatter entry. String-typed values are kept as
 * strings; anything outside the parser subset is preserved under a
 * single key so the file still round-trips on a re-run.
 */
export interface IFrontmatterShape {
	[key: string]: string | boolean | number | null | string[];
}
