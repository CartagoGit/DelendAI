/**
 * `brand-icons.ts` — thin re-export so consumers inside
 * `packages/ui-extension` can import brand/flag SVGs from
 * `@mcp-vertex/shared/components/ui/brand-icons` without spreading
 * the dependency everywhere.
 */
export {
	allBrandCodes,
	allFlagCodes,
	BRAND_ICONS,
	FLAGS,
	FLAG_NAMES,
	hasBrandIcon,
	hasFlagIcon,
	languageFlag,
	renderBrandIcon,
	renderFlagIcon,
} from '@mcp-vertex/shared/components/ui/brand-icons';
