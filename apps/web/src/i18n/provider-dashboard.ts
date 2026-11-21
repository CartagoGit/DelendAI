/**
 * provider-dashboard.ts — f00098 S5 web-parity i18n.
 *
 * Strings for the static `/providers` parity page (the provider-status
 * dashboard the VS Code host renders live). Follows the same
 * standalone-`byLang` fallback pattern as `installDummiesByLang` in
 * `./install-ecosystems.ts` and `proposalBoardByLang` in
 * `./proposals-board.ts`: `en` is the source of truth, `es` is translated,
 * and every other language falls back to `en`. Because this map is NOT part
 * of the site `ITranslations` (`dictsByLang`), it sits outside the
 * `check:i18n` site-dict walk — adding a key here never breaks the 12-lang
 * gate, and the page always resolves for every locale.
 *
 * Vocabulary note: the `states` record is keyed by the S1 render-model's
 * `ProviderState` union (mirrored in `#DATA/provider-dashboard`), so a new
 * provider state is a TypeScript error here until its copy is provided.
 */
import type { ProviderState } from '#DATA/provider-dashboard';
import type { Lang } from '#I18N/shared';

export interface IProviderDashboardTranslations {
	readonly title: string;
	readonly lead: string;
	/** Banner clarifying the page is a static showcase, not a live panel. */
	readonly staticNote: { readonly title: string; readonly body: string };
	readonly roster: {
		readonly title: string;
		readonly body: string;
		/** Secrets posture callout: env-var names only, never cleartext. */
		readonly secretsTitle: string;
		readonly secretsBody: string;
	};
	readonly optIn: {
		readonly title: string;
		readonly body: string;
	};
	readonly showcase: {
		readonly title: string;
		readonly body: string;
		readonly checkedAt: string;
		readonly summary: {
			readonly total: string;
			readonly available: string;
			readonly unavailable: string;
		};
		readonly table: {
			readonly provider: string;
			readonly state: string;
			readonly model: string;
			readonly cli: string;
			readonly auth: string;
			readonly quota: string;
		};
		readonly reachable: string;
		readonly unreachable: string;
		readonly installHint: string;
		readonly noQuota: string;
	};
	readonly statesTitle: string;
	readonly states: Readonly<Record<ProviderState, string>>;
	readonly absent: { readonly title: string; readonly body: string };
	readonly modelAttribution: {
		readonly title: string;
		readonly body: string;
	};
}

const en: IProviderDashboardTranslations = {
	title: 'Provider dashboard',
	lead: 'A static parity view of the multi-model provider dashboard — the same render-model the VS Code host builds live from healthcheck_providers and get_quota. It documents the provider roster config, the dashboard vocabulary, and how to opt in.',
	staticNote: {
		title: 'Static by design',
		body: 'The docs site never talks to a running server. Everything below is a frozen fixture of the exact render-model the host-agnostic builder emits — the live panel in VS Code renders the same shapes from real tool payloads.',
	},
	roster: {
		title: 'The provider roster',
		body: 'Providers are declared once, in the root-level providers block of delendai.config.json. Each entry names the model, how to invoke it (api, cli, subscription, or mcp-server), its context window, a 1–5 cost tier, and capability strengths/weaknesses used by routing.',
		secretsTitle: 'Secrets are env-var names, never keys',
		secretsBody:
			'The config file is committed, so it never carries a literal API key. An api provider declares only the NAME of the environment variable holding the key ("envVar": "OPENAI_API_KEY") — ${OPENAI_API_KEY}-style references by name, resolved by the runtime. A cleartext key in any config file fails the repo-wide lint:no-cleartext-secrets gate.',
	},
	optIn: {
		title: 'Opt in',
		body: 'The dashboard is powered by two opt-in plugins — usage-tracking and orchestrator-runner. Neither ships in any preset, so start the server with both enabled (the runner depends on usage-tracking):',
	},
	showcase: {
		title: 'The dashboard, rendered',
		body: 'A three-provider roster as the dashboard projects it: one healthy CLI provider, one API provider over its hourly quota, and one CLI that is not installed (with its install hint). Quota meters show used / limit with a whole-percent fill that can exceed 100.',
		checkedAt: 'Checked at',
		summary: {
			total: 'total',
			available: 'available',
			unavailable: 'unavailable',
		},
		table: {
			provider: 'Provider',
			state: 'State',
			model: 'Model',
			cli: 'CLI',
			auth: 'Auth',
			quota: 'Quota',
		},
		reachable: 'reachable',
		unreachable: 'unreachable',
		installHint: 'Install hint',
		noQuota: 'no quota data',
	},
	statesTitle: 'Provider states',
	states: {
		available:
			'CLI installed, authenticated, model reachable — the only state that counts as reachable.',
		'quota-exceeded':
			'A quota window is exhausted; routing skips this provider until the window resets.',
		'rate-limited':
			'The provider is temporarily throttling requests; it recovers on its own.',
		unauthenticated:
			'The CLI or API credential is missing or expired — re-authenticate to recover.',
		'not-installed':
			'The provider CLI is not on PATH; the row carries an install hint (dangerous pipe-to-shell installers are flagged).',
		'model-unavailable':
			'The CLI works but the requested model id is not available on this account or tier.',
		error: 'The health probe failed in an unexpected way; details land in the healthcheck snapshot.',
	},
	absent: {
		title: 'When the plugins are not loaded',
		body: 'Every host view degrades to this hint — never an error state. The builder returns an explicit plugin-absent model with the exact opt-in command:',
	},
	modelAttribution: {
		title: 'Savings by model',
		body: 'The same frozen render-model used by the IDE: spend, tokens used and tokens saved, sorted by savings.',
	},
};

const es: IProviderDashboardTranslations = {
	title: 'Panel de proveedores',
	lead: 'Una vista estática de paridad del panel multi-modelo de proveedores — el mismo render-model que el host de VS Code construye en vivo a partir de healthcheck_providers y get_quota. Documenta la configuración del roster de proveedores, el vocabulario del panel y cómo activarlo.',
	staticNote: {
		title: 'Estático por diseño',
		body: 'El sitio de documentación nunca habla con un servidor en ejecución. Todo lo que sigue es una instantánea congelada del render-model exacto que emite el builder agnóstico del host — el panel en vivo de VS Code renderiza las mismas formas desde payloads reales.',
	},
	roster: {
		title: 'El roster de proveedores',
		body: 'Los proveedores se declaran una sola vez, en el bloque providers de nivel raíz de delendai.config.json. Cada entrada indica el modelo, cómo invocarlo (api, cli, subscription o mcp-server), su ventana de contexto, un nivel de coste de 1 a 5 y las fortalezas/debilidades de capacidad que usa el enrutado.',
		secretsTitle:
			'Los secretos son nombres de variables de entorno, nunca claves',
		secretsBody:
			'El archivo de configuración se versiona, así que nunca contiene una API key literal. Un proveedor api declara solo el NOMBRE de la variable de entorno que guarda la clave ("envVar": "OPENAI_API_KEY") — referencias por nombre al estilo ${OPENAI_API_KEY}, resueltas por el runtime. Una clave en texto claro en cualquier config falla el gate global lint:no-cleartext-secrets.',
	},
	optIn: {
		title: 'Actívalo',
		body: 'El panel se apoya en dos plugins opcionales — usage-tracking y orchestrator-runner. Ninguno viene en ningún preset, así que arranca el servidor con ambos habilitados (el runner depende de usage-tracking):',
	},
	showcase: {
		title: 'El panel, renderizado',
		body: 'Un roster de tres proveedores tal como lo proyecta el panel: un proveedor CLI sano, un proveedor API que superó su cuota horaria y un CLI no instalado (con su pista de instalación). Los medidores de cuota muestran usado / límite con un porcentaje entero que puede superar 100.',
		checkedAt: 'Comprobado en',
		summary: {
			total: 'total',
			available: 'disponibles',
			unavailable: 'no disponibles',
		},
		table: {
			provider: 'Proveedor',
			state: 'Estado',
			model: 'Modelo',
			cli: 'CLI',
			auth: 'Auth',
			quota: 'Cuota',
		},
		reachable: 'alcanzable',
		unreachable: 'no alcanzable',
		installHint: 'Pista de instalación',
		noQuota: 'sin datos de cuota',
	},
	statesTitle: 'Estados de proveedor',
	states: {
		available:
			'CLI instalada, autenticada y modelo accesible — el único estado que cuenta como alcanzable.',
		'quota-exceeded':
			'Una ventana de cuota está agotada; el enrutado omite este proveedor hasta que la ventana se reinicie.',
		'rate-limited':
			'El proveedor está limitando peticiones temporalmente; se recupera solo.',
		unauthenticated:
			'Falta o expiró la credencial de la CLI o la API — re-autentícate para recuperarlo.',
		'not-installed':
			'La CLI del proveedor no está en el PATH; la fila incluye una pista de instalación (los instaladores pipe-to-shell peligrosos van marcados).',
		'model-unavailable':
			'La CLI funciona pero el modelo solicitado no está disponible en esta cuenta o nivel.',
		error: 'La sonda de salud falló de forma inesperada; los detalles quedan en la instantánea de healthcheck.',
	},
	absent: {
		title: 'Cuando los plugins no están cargados',
		body: 'Toda vista del host degrada a esta pista — nunca a un estado de error. El builder devuelve un modelo plugin-absent explícito con el comando exacto de activación:',
	},
	modelAttribution: {
		title: 'Ahorro por modelo',
		body: 'El mismo render-model congelado que usa el IDE: coste, tokens usados y tokens ahorrados, ordenado por ahorro.',
	},
};

export const providerDashboardByLang: Readonly<
	Record<Lang, IProviderDashboardTranslations>
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
