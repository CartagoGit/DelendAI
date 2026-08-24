import type { IPluginPageTranslations } from '#I18N/shared';

import { GENERATED_PLUGIN_MANIFEST_WEB_CATALOG } from '../generated/plugin-manifest-catalog.generated';

type IGeneratedPluginProfile =
	(typeof GENERATED_PLUGIN_MANIFEST_WEB_CATALOG)[number];

interface IPluginProfileViewModel {
	readonly id: string;
	readonly maturity: string;
	readonly presets: readonly string[];
	readonly permissions: readonly string[];
	readonly tokenBudget: {
		readonly warning: number;
		readonly hard: number;
		readonly releaseRelativePercent: number;
	};
}

const titleCase = (value: string): string =>
	value
		.split(/[-_]/u)
		.filter((segment) => segment.length > 0)
		.map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
		.join(' ');

export const resolveGeneratedPluginProfile = (
	slug: string,
): IGeneratedPluginProfile | undefined =>
	GENERATED_PLUGIN_MANIFEST_WEB_CATALOG.find((entry) => entry.id === slug);

const resolveMaturity = (
	maturity: string,
	t: IPluginPageTranslations,
): string => {
	switch (maturity) {
		case 'stable':
			return t.maturityStable;
		case 'experimental':
			return t.maturityExperimental;
		default:
			return titleCase(maturity);
	}
};

const resolvePermission = (
	permission: string,
	t: IPluginPageTranslations,
): string => {
	switch (permission) {
		case 'filesystem-read':
			return t.permissionFilesystemRead;
		default:
			return titleCase(permission);
	}
};

export const buildPluginProfile = (
	slug: string,
	t: IPluginPageTranslations,
): IPluginProfileViewModel | undefined => {
	const entry = resolveGeneratedPluginProfile(slug);
	if (!entry) return undefined;
	return {
		id: entry.id,
		maturity: resolveMaturity(entry.maturity, t),
		presets: [...entry.presets],
		permissions: entry.permissions.map((permission) =>
			resolvePermission(permission, t),
		),
		tokenBudget: {
			warning: entry.tokenBudget.warning,
			hard: entry.tokenBudget.hard,
			releaseRelativePercent: entry.tokenBudget.releaseRelativePercent,
		},
	};
};
