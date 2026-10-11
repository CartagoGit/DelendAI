/**
 * roadmap-board.ts — strings for the static `/[lang]/roadmap` page.
 *
 * Follows the standalone-`byLang` pattern of `proposals-board.ts`: `en` is
 * the source of truth, `es` is translated, and every other language falls
 * back to `en`. The map is not part of the site `ITranslations`, so adding
 * a key here never touches the 12-language site-dict gate, and the page
 * resolves for every locale.
 */
import type { Lang } from '#I18N/shared';

export interface IRoadmapBoardTranslations {
	readonly title: string;
	readonly lead: string;
	readonly intent: { readonly title: string; readonly body: string };
	readonly empty: string;
	readonly version: string;
	readonly bump: string;
	readonly bumpAuthority: string;
	readonly progress: string;
	readonly counts: {
		readonly delivered: string;
		readonly open: string;
		readonly withdrawn: string;
	};
	readonly states: Readonly<Record<string, string>>;
	readonly kinds: Readonly<Record<string, string>>;
	readonly estimate: string;
	readonly source: string;
}

const en: IRoadmapBoardTranslations = {
	title: 'Roadmap',
	lead: 'What each version promises, and how far along it is.',
	intent: {
		title: 'Intent, not live state',
		body: 'This page is generated from the roadmap file in the repository. It shows what is promised and where each entry stands; whether a version can be promoted right now is answered live by the roadmap tools and the editor view.',
	},
	empty: 'This project declares no roadmap yet.',
	version: 'Version',
	bump: 'Bump its promises imply',
	bumpAuthority: 'decided by',
	progress: 'Delivered',
	counts: { delivered: 'delivered', open: 'open', withdrawn: 'withdrawn' },
	states: {
		proposed: 'Proposed',
		committed: 'Committed',
		'in-progress': 'In progress',
		delivered: 'Delivered',
		deferred: 'Deferred',
		dropped: 'Dropped',
		superseded: 'Superseded',
	},
	kinds: {
		breaking: 'Breaking change',
		feature: 'Feature',
		fix: 'Fix',
		chore: 'Chore',
	},
	estimate: 'Estimate',
	source: 'Source',
};

const es: IRoadmapBoardTranslations = {
	title: 'Hoja de ruta',
	lead: 'Qué promete cada versión y cuánto lleva recorrido.',
	intent: {
		title: 'Intención, no estado en vivo',
		body: 'Esta página se genera a partir del fichero de hoja de ruta del repositorio. Muestra lo prometido y en qué punto está cada entrada; si una versión puede promocionarse ahora mismo lo responden en vivo las herramientas de la hoja de ruta y la vista del editor.',
	},
	empty: 'Este proyecto todavía no declara una hoja de ruta.',
	version: 'Versión',
	bump: 'Incremento que implican sus promesas',
	bumpAuthority: 'lo decide',
	progress: 'Entregado',
	counts: {
		delivered: 'entregadas',
		open: 'abiertas',
		withdrawn: 'retiradas',
	},
	states: {
		proposed: 'Propuesta',
		committed: 'Comprometida',
		'in-progress': 'En curso',
		delivered: 'Entregada',
		deferred: 'Aplazada',
		dropped: 'Descartada',
		superseded: 'Sustituida',
	},
	kinds: {
		breaking: 'Cambio incompatible',
		feature: 'Funcionalidad',
		fix: 'Corrección',
		chore: 'Mantenimiento',
	},
	estimate: 'Estimación',
	source: 'Fuente',
};

export const roadmapBoardByLang: Readonly<
	Record<Lang, IRoadmapBoardTranslations>
> = {
	ar: en,
	de: en,
	en,
	es,
	fr: en,
	hi: en,
	it: en,
	ja: en,
	pt: en,
	th: en,
	vi: en,
	zh: en,
};
