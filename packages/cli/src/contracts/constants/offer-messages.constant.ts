/**
 * offer-messages.constant.ts — what the offer of accounts says, in each
 * language it speaks. A language missing here is spoken in English.
 */
import type { IAccountFinding } from '@delendai/core/contracts';

import type {
	IOfferLang,
	IOfferMessages,
} from '../interfaces/offer-messages.interface';

const ENGLISH: IOfferMessages = {
	lang: 'en',
	title: 'Your AI accounts',
	intro: 'delendai looks for the AI clients, keys and models on this machine and offers each as an account for this project. It reads names only, never the value of a key. Nothing is added without your yes.',
	steps: {
		clients:
			'Looking at the AI clients installed here and how each is logged in',
		sources:
			'Looking at plan tools, local servers and the providers clients reach',
		'sources-and-catalogue':
			'Looking at plan tools, local servers, the providers clients reach and the public model catalogue',
		names: 'Naming the keys in your environment and the models your chats used',
	},
	asking: (clients, elapsed) => `asking ${clients}… ${elapsed}`,
	verdicts: {
		usable: 'logged in',
		'needs-login': 'not logged in',
		'needs-plan': 'needs a plan',
		'quota-exhausted': 'out of quota',
		'not-installed': 'not installed',
		unknown: 'answered',
	},
	sources: {
		'client-login': 'AI client logged in here',
		'client-provider': 'Provider a client reaches',
		'credential-variable': 'Key in your environment',
		'seen-models': 'Models your chats used',
		'plan-tool': 'Plan tool',
		'local-endpoint': 'Server on this machine',
		'host-byok': 'Model your editor serves on your key',
	},
	subject: (finding: IAccountFinding) => {
		const name = finding.subject ?? finding.displayName;
		if (finding.via !== undefined) return `${name}, through ${finding.via}`;
		if (finding.credentialEnv !== undefined)
			return `${name}, key in ${finding.credentialEnv}`;
		if (finding.port !== undefined)
			return `${name}, port ${String(finding.port)}`;
		return name;
	},
	models: (shown, more) =>
		`Models: ${shown}${more > 0 ? ` and ${String(more)} more` : ''}`,
	variableNote: (variable) => `${variable} is set; its value is not read`,
	credentialModes: {
		'official-subscription-login': 'logged in with a subscription',
		'provider-plan-token': 'a plan token',
		'byok-api-key': 'your own API key',
		'host-held': 'your key, kept by your editor',
		'local-none': 'no credential',
	},
	billingModes: {
		'subscription-included': 'included in the subscription',
		'prepaid-token-plan': 'prepaid plan',
		'pay-as-you-go': 'pay as you go',
		local: 'local, no bill',
	},
	offersHeading: (count) =>
		`${String(count)} account(s) ready to add, each asked once`,
	classifyHeading: (count) =>
		`${String(count)} more found that delendai cannot place on its own`,
	accountLine: (accountId) => `Account id: ${accountId}`,
	addQuestion: 'Add it to your own file for this project?',
	automationQuestion:
		'May delendai use it for unattended work? Anything that may spend still asks you first',
	beforeClassifying: (count) =>
		`For each of these ${String(count)}, two short questions: who bills you, and how you pay. Go through them now?`,
	suggested: (vendor) => `Suggested company: ${vendor}`,
	vendorQuestion:
		'Who bills you for it? Type the company you pay; Enter keeps the suggestion, "skip" leaves it, q stops',
	skipWords: ['skip'],
	payQuestion: (vendor) => `How do you pay ${vendor} for it?`,
	payment: {
		'subscription-included':
			'a subscription (a monthly plan you log in to)',
		'prepaid-token-plan': 'a prepaid plan (tokens or prompts bought ahead)',
		'pay-as-you-go': 'pay as you go (billed per use)',
		local: 'local (runs on this machine, no bill)',
		skip: 'skip it for now',
	},
	yesNo: {
		yes: ['y', 'yes'],
		no: ['n', 'no'],
		stop: ['q', 'quit'],
		hint: (stoppable) => `(y/n${stoppable ? ', q to stop' : ''})`,
		fallbackKey: (fallback) => (fallback ? 'y' : 'n'),
		retry: (answer, stoppable) =>
			`Unrecognised answer "${answer}" — please type y or n${stoppable ? ' (q to stop)' : ''}.`,
		tooMany: (fallback) =>
			`Too many invalid answers — using default (${fallback}).`,
	},
	summaryHeading: 'Summary',
	added: 'Added',
	declined: 'Declined',
	notAsked: 'Not asked yet',
	yourFile: 'Your file',
	none: 'none',
	notAskedHint: 'run it again to go through them',
	automationHint:
		"Change unattended use any time with 'delendai accounts automation <id> on|off'.",
	stopped:
		'Stopped. What you answered is kept; the rest is offered next time.',
	nothingFound:
		'Nothing new to offer: every account found is already added or declined.',
	languageQuestion: 'Which language should delendai speak to you?',
	languageSaved: (code) =>
		`Saved: delendai speaks ${code} from now on ('delendai language <code>' changes it).`,
};

const SPANISH: IOfferMessages = {
	lang: 'es',
	title: 'Tus cuentas de IA',
	intro: 'delendai busca los clientes de IA, las claves y los modelos de esta máquina y te ofrece cada uno como cuenta para este proyecto. Solo lee nombres, nunca el valor de una clave. No se añade nada sin tu sí.',
	steps: {
		clients:
			'Mirando los clientes de IA instalados y con qué sesión está cada uno',
		sources:
			'Mirando herramientas de plan, servidores locales y los proveedores a los que llegan los clientes',
		'sources-and-catalogue':
			'Mirando herramientas de plan, servidores locales, los proveedores de los clientes y el catálogo público de modelos',
		names: 'Poniendo nombre a las claves de tu entorno y a los modelos que usaron tus chats',
	},
	asking: (clients, elapsed) => `preguntando a ${clients}… ${elapsed}`,
	verdicts: {
		usable: 'sesión iniciada',
		'needs-login': 'sin sesión',
		'needs-plan': 'necesita un plan',
		'quota-exhausted': 'sin cuota',
		'not-installed': 'no instalado',
		unknown: 'ha respondido',
	},
	sources: {
		'client-login': 'Cliente de IA con sesión aquí',
		'client-provider': 'Proveedor al que llega un cliente',
		'credential-variable': 'Clave en tu entorno',
		'seen-models': 'Modelos que usaron tus chats',
		'plan-tool': 'Herramienta de plan',
		'local-endpoint': 'Servidor en esta máquina',
		'host-byok': 'Modelo que tu editor sirve con tu clave',
	},
	subject: (finding: IAccountFinding) => {
		const name = finding.subject ?? finding.displayName;
		if (finding.via !== undefined)
			return `${name}, a través de ${finding.via}`;
		if (finding.credentialEnv !== undefined)
			return `${name}, clave en ${finding.credentialEnv}`;
		if (finding.port !== undefined)
			return `${name}, puerto ${String(finding.port)}`;
		return name;
	},
	models: (shown, more) =>
		`Modelos: ${shown}${more > 0 ? ` y ${String(more)} más` : ''}`,
	variableNote: (variable) => `${variable} está definida; su valor no se lee`,
	credentialModes: {
		'official-subscription-login': 'sesión con suscripción',
		'provider-plan-token': 'token de un plan',
		'byok-api-key': 'tu propia clave de API',
		'host-held': 'tu clave, guardada por tu editor',
		'local-none': 'sin credencial',
	},
	billingModes: {
		'subscription-included': 'incluido en la suscripción',
		'prepaid-token-plan': 'plan prepago',
		'pay-as-you-go': 'pago por uso',
		local: 'local, sin factura',
	},
	offersHeading: (count) =>
		`${String(count)} cuenta(s) lista(s) para añadir; cada una se pregunta una vez`,
	classifyHeading: (count) =>
		`${String(count)} más encontradas que delendai no sabe situar por sí solo`,
	accountLine: (accountId) => `Id de la cuenta: ${accountId}`,
	addQuestion: '¿La añado a tu archivo personal de este proyecto?',
	automationQuestion:
		'¿Puede delendai usarla en trabajo desatendido? Lo que pueda costar dinero te lo sigue preguntando antes',
	beforeClassifying: (count) =>
		`Para cada una de estas ${String(count)}, dos preguntas cortas: quién te la cobra y cómo pagas. ¿Las repasamos ahora?`,
	suggested: (vendor) => `Empresa sugerida: ${vendor}`,
	vendorQuestion:
		'¿Quién te la cobra? Escribe la empresa a la que pagas; Enter acepta la sugerencia, "saltar" la deja para otra vez, q para',
	skipWords: ['saltar', 'skip'],
	payQuestion: (vendor) => `¿Cómo le pagas a ${vendor}?`,
	payment: {
		'subscription-included':
			'una suscripción (un plan mensual con el que inicias sesión)',
		'prepaid-token-plan':
			'un plan prepago (tokens o peticiones compradas por adelantado)',
		'pay-as-you-go': 'pago por uso (te cobran lo que gastas)',
		local: 'local (se ejecuta en esta máquina, sin factura)',
		skip: 'saltarla por ahora',
	},
	yesNo: {
		yes: ['s', 'si', 'sí', 'y', 'yes'],
		no: ['n', 'no'],
		stop: ['q', 'salir', 'quit'],
		hint: (stoppable) => `(s/n${stoppable ? ', q para parar' : ''})`,
		fallbackKey: (fallback) => (fallback ? 's' : 'n'),
		retry: (answer, stoppable) =>
			`No entiendo "${answer}": escribe s o n${stoppable ? ' (q para parar)' : ''}.`,
		tooMany: (fallback) =>
			`Demasiadas respuestas no válidas: uso la opción por defecto (${fallback}).`,
	},
	summaryHeading: 'Resumen',
	added: 'Añadidas',
	declined: 'Rechazadas',
	notAsked: 'Sin preguntar aún',
	yourFile: 'Tu archivo',
	none: 'ninguna',
	notAskedHint: 'vuelve a ejecutarlo para repasarlas',
	automationHint:
		"Cambia el uso desatendido cuando quieras con 'delendai accounts automation <id> on|off'.",
	stopped:
		'Parado. Lo que respondiste se guarda; el resto se te ofrece la próxima vez.',
	nothingFound:
		'Nada nuevo que ofrecer: todas las cuentas encontradas ya están añadidas o rechazadas.',
	languageQuestion: '¿En qué idioma quieres que te hable delendai?',
	languageSaved: (code) =>
		`Guardado: delendai te habla en ${code} a partir de ahora ('delendai language <código>' lo cambia).`,
};

/** Each language the offer speaks, by its code. */
export const OFFER_MESSAGES: Readonly<Record<IOfferLang, IOfferMessages>> = {
	en: ENGLISH,
	es: SPANISH,
};

/** The languages the offer speaks, English first. */
export const OFFER_LANGS: readonly IOfferLang[] = ['en', 'es'];

/** The languages a person can choose, with their own names. */
export const OFFER_LANGUAGE_NAMES: Readonly<Record<IOfferLang, string>> = {
	en: 'English',
	es: 'Español',
};

/** What the offer says in `lang`; English for a language it does not speak. */
export const offerMessagesFor = (lang: string): IOfferMessages =>
	Object.entries(OFFER_MESSAGES).find(([code]) => code === lang)?.[1] ??
	ENGLISH;
