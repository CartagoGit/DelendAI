import type { Lang } from '#I18N/ui';

export interface IPageFrontmatter {
	readonly title: string;
	readonly description: string;
	readonly order?: number;
	readonly navLabel?: string;
	readonly ogImage?: string;
	readonly noindex?: boolean;
}

export interface IPageTranslation {
	readonly frontmatter: IPageFrontmatter;
	readonly body: string;
}

export interface PageSpec {
	readonly slug: string;
	readonly frontmatter: IPageFrontmatter;
	readonly body: string;
	readonly translations: Readonly<Record<Lang, IPageTranslation>>;
}
