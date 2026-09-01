/**
 * i18n-types.ts — String catalog for the commit-policy plugin's
 * user-visible outputs.
 *
 * Server-side plugins do not own IDE-facing translations; the
 * `extensions/vscode` extension handles UI strings. What this file
 * defines is the **shape** of every user-visible string the plugin
 * produces, so a host that wants to localize the surface can
 * intercept the catalog at the tool boundary. The default catalog
 * is bilingual (en + es) because the request that spawned the
 * plugin is in Spanish and the canonical repo README is in English
 * — both halves ship out of the box.
 *
 * Adding a new language: append a property to `Locale` below and
 * translate the keys. Tests cover both locales by default.
 */

/** Locale ids the catalog understands. Add a new entry to ship a new locale. */
export type Locale = 'en' | 'es';

export type ConventionalHeaderRefusalCode =
	| 'EMPTY_HEADER'
	| 'MALFORMED_HEADER'
	| 'UNKNOWN_TYPE';

interface IStringCatalog {
	readonly contracts: {
		readonly scope: {
			readonly refusalTips: Record<ConventionalHeaderRefusalCode, string>;
		};
	};
	readonly tools: {
		readonly status: {
			readonly summary: (params: {
				readonly commitEnabled: boolean;
				readonly pushEnabled: boolean;
				readonly triggerCount: number;
			}) => string;
			readonly identityMode: string;
			readonly identityEffective: string;
		};
		readonly commit: {
			readonly refuseDisabled: string;
			readonly refuseNoIdentity: (params: {
				readonly mode: string;
			}) => string;
			readonly refuseProtectedBranch: (params: {
				readonly branch: string;
			}) => string;
			readonly success: (params: {
				readonly hash: string;
				readonly author: string;
			}) => string;
			readonly nextActionCommit: string;
			readonly nextActionIdentity: string;
			readonly nextActionProtected: string;
		};
		readonly push: {
			readonly refuseDisabled: string;
			readonly refuseProtected: (params: {
				readonly branch: string;
			}) => string;
			readonly refuseNotImplemented: string;
			readonly success: (params: { readonly remote: string }) => string;
			readonly nextActionDisabled: string;
			readonly nextActionProtected: string;
		};
		readonly run: {
			readonly refuseDisabled: string;
			readonly noTrigger: (params: { readonly kind: string }) => string;
			readonly fired: (params: {
				readonly kind: string;
				readonly committed: boolean;
				readonly pushed: boolean;
			}) => string;
		};
	};
}

const english: IStringCatalog = {
	contracts: {
		scope: {
			refusalTips: {
				EMPTY_HEADER:
					'Provide a Conventional Commit header like "fix: subject" before auto-scoping it.',
				MALFORMED_HEADER:
					'Use the Conventional Commit form "type(scope)!: subject" or "type: subject".',
				UNKNOWN_TYPE:
					'Use a supported Conventional Commit type like "feat", "fix", "docs", or "chore".',
			},
		},
	},
	tools: {
		status: {
			summary: ({ commitEnabled, pushEnabled, triggerCount }) =>
				`commit-policy: commit=${commitEnabled ? 'on' : 'off'}, push=${pushEnabled ? 'on' : 'off'}, triggers=${triggerCount}`,
			identityMode: 'Identity mode',
			identityEffective: 'Effective identity',
		},
		commit: {
			refuseDisabled:
				'commit_policy_commit refused: commit.enabled is false in mcp-vertex.config.json.',
			refuseNoIdentity: ({ mode }) =>
				`commit_policy_commit refused: identity.mode="${mode}" resolved to an empty author.`,
			refuseProtectedBranch: ({ branch }) =>
				`commit_policy_commit refused: slice would push to protected branch "${branch}".`,
			success: ({ hash, author }) =>
				`commit_policy_commit committed ${hash} as ${author}`,
			nextActionCommit:
				'Set plugins.commit-policy.options.commit.enabled=true in mcp-vertex.config.json, or call commit_policy_run with kind="manual".',
			nextActionIdentity:
				'Set GIT_AUTHOR_NAME + GIT_AUTHOR_EMAIL, or change plugins.commit-policy.options.identity to a different mode.',
			nextActionProtected:
				'Move the slice to a feature/agent branch before closing it.',
		},
		push: {
			refuseDisabled:
				'commit_policy_push refused: push.enabled is false in mcp-vertex.config.json.',
			refuseProtected: ({ branch }) =>
				`commit_policy_push refused: pushing to protected branch "${branch}" is not allowed.`,
			refuseNotImplemented:
				'commit_policy_push requires an explicit `remote` and `branch` (or set push.remote + push.branch in the config).',
			success: ({ remote }) =>
				`commit_policy_push pushed ${remote === '' ? '(current)' : remote}`,
			nextActionDisabled:
				'Set plugins.commit-policy.options.push.enabled=true, or call commit_policy_run with kind="manual".',
			nextActionProtected:
				'Push to a feature/agent branch and open a PR instead.',
		},
		run: {
			refuseDisabled:
				'commit_policy_run refused: commit.enabled is false in mcp-vertex.config.json.',
			noTrigger: ({ kind }) =>
				`commit_policy_run: no trigger of kind "${kind}" is configured. Pass it under cadence.triggers.`,
			fired: ({ kind, committed, pushed }) =>
				`commit_policy_run fired trigger=${kind}: committed=${committed} pushed=${pushed}`,
		},
	},
};

const spanish: IStringCatalog = {
	contracts: {
		scope: {
			refusalTips: {
				EMPTY_HEADER:
					'Proporciona primero un header Conventional Commit como "fix: asunto" antes de aplicar auto-scope.',
				MALFORMED_HEADER:
					'Usa el formato Conventional Commit "type(scope)!: asunto" o "type: asunto".',
				UNKNOWN_TYPE:
					'Usa un tipo Conventional Commit admitido como "feat", "fix", "docs" o "chore".',
			},
		},
	},
	tools: {
		status: {
			summary: ({ commitEnabled, pushEnabled, triggerCount }) =>
				`commit-policy: commit=${commitEnabled ? 'activado' : 'desactivado'}, push=${pushEnabled ? 'activado' : 'desactivado'}, disparadores=${triggerCount}`,
			identityMode: 'Modo de identidad',
			identityEffective: 'Identidad efectiva',
		},
		commit: {
			refuseDisabled:
				'commit_policy_commit rechazado: commit.enabled está en false en mcp-vertex.config.json.',
			refuseNoIdentity: ({ mode }) =>
				`commit_policy_commit rechazado: identity.mode="${mode}" resolvió un autor vacío.`,
			refuseProtectedBranch: ({ branch }) =>
				`commit_policy_commit rechazado: el slice publicaría en la rama protegida "${branch}".`,
			success: ({ hash, author }) =>
				`commit_policy_commit creó el commit ${hash} como ${author}`,
			nextActionCommit:
				'Activa plugins.commit-policy.options.commit.enabled=true en mcp-vertex.config.json o llama a commit_policy_run con kind="manual".',
			nextActionIdentity:
				'Define GIT_AUTHOR_NAME + GIT_AUTHOR_EMAIL o cambia plugins.commit-policy.options.identity a otro modo.',
			nextActionProtected:
				'Mueve el slice a una rama feature/agent antes de cerrarlo.',
		},
		push: {
			refuseDisabled:
				'commit_policy_push rechazado: push.enabled está en false en mcp-vertex.config.json.',
			refuseProtected: ({ branch }) =>
				`commit_policy_push rechazado: no se permite hacer push a la rama protegida "${branch}".`,
			refuseNotImplemented:
				'commit_policy_push requiere un `remote` y `branch` explícitos (o define push.remote + push.branch en la config).',
			success: ({ remote }) =>
				`commit_policy_push hizo push ${remote === '' ? '(rama actual)' : `a ${remote}`}`,
			nextActionDisabled:
				'Activa plugins.commit-policy.options.push.enabled=true o llama a commit_policy_run con kind="manual".',
			nextActionProtected:
				'Haz push a una rama feature/agent y abre un PR en su lugar.',
		},
		run: {
			refuseDisabled:
				'commit_policy_run rechazado: commit.enabled está en false en mcp-vertex.config.json.',
			noTrigger: ({ kind }) =>
				`commit_policy_run: no hay disparador de tipo "${kind}" configurado. Añádelo bajo cadence.triggers.`,
			fired: ({ kind, committed, pushed }) =>
				`commit_policy_run disparó trigger=${kind}: commit=${committed} push=${pushed}`,
		},
	},
};

const CATALOGS: Readonly<Record<Locale, IStringCatalog>> = {
	en: english,
	es: spanish,
};

export const SUPPORTED_LOCALES: readonly Locale[] = Object.keys(
	CATALOGS,
) as Locale[];

/**
 * Look up a localized string (or any value the caller wants to pull
 * from the catalog). Falls back to English when the locale is
 * unknown (hosts can pass `process.env.MCP_VERTEX_LOCALE` and the
 * plugin resolves it; absent = English). Generic so callers can
 * extract either a single string or an object literal (e.g.
 * `{ summary, nextAction }`) — the catalog returns whatever the
 * accessor asks for.
 */
export const localizedString = <T>(
	locale: string | undefined,
	accessor: (catalog: IStringCatalog) => T,
): T => {
	const key: Locale = locale === 'es' ? 'es' : 'en';
	const catalog = CATALOGS[key] ?? english;
	return accessor(catalog);
};

export const localizedScopeRefusalTip = (
	locale: string | undefined,
	code: ConventionalHeaderRefusalCode,
): string =>
	localizedString(
		locale,
		(catalog) => catalog.contracts.scope.refusalTips[code],
	);

export type { IStringCatalog };
