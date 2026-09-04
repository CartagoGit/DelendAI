/**
 * install-ecosystems.ts — f00065 S4 junior-grade install copy.
 *
 * Beginner "for dummies" explanations for the icon+name runtime selector on the
 * home page (Node / Python / PHP), one friendly paragraph per packager. Follows
 * the same standalone-`byLang` fallback pattern as `proposalBoardByLang` in
 * `./proposals-board.ts`: `en` is the source of truth, `es` is translated, and
 * every other language falls back to `en`. Because this map is NOT part of the
 * site `ITranslations` (`dictsByLang`), it sits outside the `check:i18n`
 * site-dict walk — adding a key here never breaks the 12-lang gate, and the
 * section always resolves for every locale.
 *
 * The `Record<EcosystemKey, …>` / `Record<PackagerDummiesKey, …>` shapes are
 * keyed off the data-model unions in `#DATA/install`, so adding a packager (a
 * new `dummiesKey`) is a TypeScript error here until its copy is provided.
 */
import type { EcosystemKey, PackagerDummiesKey } from '#DATA/install';
import type { Lang } from '#I18N/shared';

export interface IInstallDummiesTranslations {
	readonly title: string;
	readonly lead: string;
	/** Accessible label for the runtime `<Tabs>` tablist. */
	readonly selectorLabel: string;
	/** Chip rendered next to every packager, signalling beginner-friendly copy. */
	readonly beginnerBadge: string;
	/** One-line tagline shown at the top of each ecosystem panel. */
	readonly tagline: Readonly<Record<EcosystemKey, string>>;
	/** Beginner explanation rendered under each packager's name. */
	readonly dummies: Readonly<Record<PackagerDummiesKey, string>>;
}

const en: IInstallDummiesTranslations = {
	title: 'Pick the runtime you already know',
	lead: 'mcp-vertex ships as one Node package, but you do not have to be a Node developer to use it. Choose your ecosystem, then follow the packager you are comfortable with — every option ends up running the exact same server.',
	selectorLabel: 'Choose your runtime',
	beginnerBadge: 'For beginners',
	tagline: {
		node: 'mcp-vertex is a Node package — this is its home turf, so these commands are the shortest path.',
		python: 'There is no PyPI package to install; Python developers run mcp-vertex through the Node tooling their environment already has.',
		php: 'Composer and Artisan do not install mcp-vertex — they wrap the same Node CLI so your PHP or Laravel scripts can register it.',
	},
	dummies: {
		npm: 'npx ships with Node. It downloads mcp-vertex on the fly and runs it once — nothing is installed permanently, so you always get the latest version.',
		pnpm: 'pnpm dlx is pnpm’s throwaway runner. It fetches mcp-vertex into a shared store and runs it without adding anything to your project.',
		yarn: 'yarn dlx grabs mcp-vertex just for this one command and runs it, then forgets it — handy when you do not want it in package.json.',
		bun: 'bunx is Bun’s ultra-fast runner. mcp-vertex is itself built with Bun, so this is the quickest way to try it out.',
		deno: 'Deno runs npm packages directly. The -A flag grants the permissions the server needs; npm:@delendai/core names the package to fetch.',
		pip: 'There is no pip package — but pip users almost always have Node too, and npx is the simplest bridge to run mcp-vertex.',
		pipx: 'pipx runs command-line tools in isolated environments. Here it provisions a throwaway Node, then npx fetches and runs mcp-vertex.',
		uv: 'uv (uvx) is the fast modern Python runner. It can pull a Node shim and launch mcp-vertex with no global install left to clean up.',
		poetry: 'Inside a Poetry project, `poetry run` executes commands in the managed virtualenv. Point it at npx and mcp-vertex runs alongside your Python deps.',
		composer:
			'Composer is PHP’s package manager. `composer exec` runs a project-local binary — here npx — so every teammate gets the same mcp-vertex command.',
		artisan:
			'Artisan is Laravel’s command runner. Wrap the npx call in a tiny Artisan command and registering mcp-vertex joins your normal `php artisan` workflow.',
	},
};

const es: IInstallDummiesTranslations = {
	title: 'Elige el entorno que ya conoces',
	lead: 'mcp-vertex se distribuye como un único paquete de Node, pero no necesitas ser desarrollador de Node para usarlo. Elige tu ecosistema y sigue el gestor con el que te sientas cómodo — todas las opciones acaban ejecutando exactamente el mismo servidor.',
	selectorLabel: 'Elige tu entorno',
	beginnerBadge: 'Para principiantes',
	tagline: {
		node: 'mcp-vertex es un paquete de Node — es su terreno natural, así que estos comandos son el camino más corto.',
		python: 'No hay ningún paquete en PyPI que instalar; quienes usan Python ejecutan mcp-vertex a través de las herramientas de Node que su entorno ya tiene.',
		php: 'Composer y Artisan no instalan mcp-vertex — envuelven la misma CLI de Node para que tus scripts de PHP o Laravel puedan registrarlo.',
	},
	dummies: {
		npm: 'npx viene con Node. Descarga mcp-vertex al vuelo y lo ejecuta una sola vez — no se instala nada de forma permanente, así que siempre obtienes la última versión.',
		pnpm: 'pnpm dlx es el ejecutor efímero de pnpm. Descarga mcp-vertex a un almacén compartido y lo ejecuta sin añadir nada a tu proyecto.',
		yarn: 'yarn dlx toma mcp-vertex solo para este comando y lo ejecuta, luego lo olvida — útil cuando no quieres tenerlo en package.json.',
		bun: 'bunx es el ejecutor ultrarrápido de Bun. mcp-vertex está construido con Bun, así que es la forma más rápida de probarlo.',
		deno: 'Deno ejecuta paquetes de npm directamente. El flag -A concede los permisos que el servidor necesita; npm:@delendai/core indica el paquete a descargar.',
		pip: 'No existe un paquete de pip — pero quienes usan pip casi siempre tienen Node también, y npx es el puente más sencillo para ejecutar mcp-vertex.',
		pipx: 'pipx ejecuta herramientas de línea de comandos en entornos aislados. Aquí provisiona un Node desechable y luego npx descarga y ejecuta mcp-vertex.',
		uv: 'uv (uvx) es el ejecutor moderno y veloz de Python. Puede traer un envoltorio de Node y lanzar mcp-vertex sin dejar ninguna instalación global que limpiar.',
		poetry: 'Dentro de un proyecto Poetry, `poetry run` ejecuta comandos en el entorno virtual gestionado. Apúntalo a npx y mcp-vertex se ejecuta junto a tus dependencias de Python.',
		composer:
			'Composer es el gestor de paquetes de PHP. `composer exec` ejecuta un binario local del proyecto — aquí npx — para que todo el equipo use el mismo comando de mcp-vertex.',
		artisan:
			'Artisan es el ejecutor de comandos de Laravel. Envuelve la llamada a npx en un pequeño comando de Artisan y registrar mcp-vertex se integra en tu flujo habitual de `php artisan`.',
	},
};

export const installDummiesByLang: Readonly<
	Record<Lang, IInstallDummiesTranslations>
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
