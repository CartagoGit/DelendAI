/**
 * frontmatter-parser.ts — where the proposals plugin reads frontmatter.
 *
 * The parser itself lives in `@delendai/proposals-sqlite`
 * (`parseProposalFrontmatter`), so the plugin and the database reconciler
 * read every proposal the same way. This module keeps the plugin's import
 * path for its callers.
 */
export {
	extractYamlBlock,
	parseFrontmatterBlock,
	parseProposalFrontmatter,
	type IYamlValue,
} from '@delendai/proposals-sqlite';
