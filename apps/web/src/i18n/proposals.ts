import type {
	IProposalGlossaryTranslations,
	IRecoveryTranslations,
	Lang,
} from '#I18N/shared';

const en: IProposalGlossaryTranslations = {
	statuses: {
		ready: {
			label: 'Ready',
			short: 'Queued',
			long: 'Triaged and ready for an agent to claim.',
		},
		in_progress: {
			label: 'In progress',
			short: 'Claimed',
			long: 'An agent owns the current slice and is actively working.',
		},
		review: {
			label: 'Review',
			short: 'Review',
			long: 'Implementation was submitted and awaits approval or changes.',
		},
		done: {
			label: 'Done',
			short: 'Closed',
			long: 'Approved, archived, and terminal unless later retired.',
		},
		paused: {
			label: 'Paused',
			short: 'Paused',
			long: 'Stopped by a human until it is explicitly resumed.',
		},
		blocked: {
			label: 'Blocked',
			short: 'Blocked',
			long: 'Waiting on dependencies or self-blocking proposal fixes.',
		},
		retired: {
			label: 'Retired',
			short: 'Retired',
			long: 'Cancelled or superseded; terminal.',
		},
	},
	kinds: {
		feat: {
			label: 'Feature',
			short: 'feat',
			long: 'User-visible capability; maps to a minor release.',
		},
		breaking: {
			label: 'Breaking',
			short: 'major',
			long: 'Breaking capability or contract change; maps to a major release.',
		},
		fix: {
			label: 'Fix',
			short: 'fix',
			long: 'Bug fix; maps to a patch release.',
		},
		refactor: {
			label: 'Refactor',
			short: 'refactor',
			long: 'Internal reshaping without intended behaviour change.',
		},
		perf: {
			label: 'Performance',
			short: 'perf',
			long: 'Performance improvement; maps to a patch release.',
		},
		audit: {
			label: 'Audit',
			short: 'audit',
			long: 'Investigation, review, or verification work.',
		},
		chore: {
			label: 'Chore',
			short: 'chore',
			long: 'Maintenance work that does not change product behaviour.',
		},
		docs: {
			label: 'Docs',
			short: 'docs',
			long: 'Documentation-only proposal.',
		},
		test: {
			label: 'Test',
			short: 'test',
			long: 'Test coverage or test infrastructure work.',
		},
		infra: {
			label: 'Infrastructure',
			short: 'infra',
			long: 'Build, CI, release, or operational infrastructure.',
		},
		spike: {
			label: 'Spike',
			short: 'spike',
			long: 'Research work that may not produce a release commit.',
		},
		legacy: {
			label: 'Legacy',
			short: 'legacy',
			long: 'Imported proposal from the pre-f113 workflow.',
		},
	},
};

const es: IProposalGlossaryTranslations = {
	statuses: {
		ready: {
			label: 'Lista',
			short: 'En cola',
			long: 'Triada y lista para que un agente la reclame.',
		},
		in_progress: {
			label: 'En curso',
			short: 'Reclamada',
			long: 'Un agente posee el slice actual y está trabajando.',
		},
		review: {
			label: 'Revisión',
			short: 'Revisión',
			long: 'La implementación fue enviada y espera aprobación o cambios.',
		},
		done: {
			label: 'Hecha',
			short: 'Cerrada',
			long: 'Aprobada, archivada y terminal salvo retirada posterior.',
		},
		paused: {
			label: 'Pausada',
			short: 'Pausada',
			long: 'Detenida por una persona hasta que se reanude explícitamente.',
		},
		blocked: {
			label: 'Bloqueada',
			short: 'Bloqueada',
			long: 'Espera dependencias o correcciones internas de la propuesta.',
		},
		retired: {
			label: 'Retirada',
			short: 'Retirada',
			long: 'Cancelada o sustituida; terminal.',
		},
	},
	kinds: {
		feat: {
			label: 'Funcionalidad',
			short: 'feat',
			long: 'Capacidad visible para usuarios; implica versión menor.',
		},
		breaking: {
			label: 'Ruptura',
			short: 'major',
			long: 'Cambio incompatible de capacidad o contrato; implica versión mayor.',
		},
		fix: {
			label: 'Corrección',
			short: 'fix',
			long: 'Corrección de bug; implica versión patch.',
		},
		refactor: {
			label: 'Refactor',
			short: 'refactor',
			long: 'Reorganización interna sin cambio de comportamiento previsto.',
		},
		perf: {
			label: 'Rendimiento',
			short: 'perf',
			long: 'Mejora de rendimiento; implica versión patch.',
		},
		audit: {
			label: 'Auditoría',
			short: 'audit',
			long: 'Investigación, revisión o verificación.',
		},
		chore: {
			label: 'Mantenimiento',
			short: 'chore',
			long: 'Trabajo de mantenimiento sin cambio de producto.',
		},
		docs: {
			label: 'Docs',
			short: 'docs',
			long: 'Propuesta solo de documentación.',
		},
		test: {
			label: 'Tests',
			short: 'test',
			long: 'Cobertura o infraestructura de pruebas.',
		},
		infra: {
			label: 'Infraestructura',
			short: 'infra',
			long: 'Build, CI, release u operaciones.',
		},
		spike: {
			label: 'Spike',
			short: 'spike',
			long: 'Investigación que puede no producir commit de release.',
		},
		legacy: {
			label: 'Legacy',
			short: 'legacy',
			long: 'Propuesta importada del flujo anterior a f113.',
		},
	},
};

export const proposalGlossaryByLang: Readonly<
	Record<Lang, IProposalGlossaryTranslations>
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

const recoveryEn: IRecoveryTranslations = {
	title: 'Recovery',
	lead: 'Agent-dead proposals and the safest recovery actions.',
	empty: 'No stale proposals are currently known.',
	agent: 'Agent',
	task: 'Task',
	lastSeen: 'Last seen',
	missedBeats: 'Missed beats',
	actions: 'Actions',
	releaseLock: 'Release lock',
	forceReady: 'Force ready',
};

const recoveryEs: IRecoveryTranslations = {
	title: 'Recuperación',
	lead: 'Propuestas con agente muerto y acciones seguras de recuperación.',
	empty: 'No hay propuestas obsoletas conocidas ahora mismo.',
	agent: 'Agente',
	task: 'Tarea',
	lastSeen: 'Última señal',
	missedBeats: 'Latidos perdidos',
	actions: 'Acciones',
	releaseLock: 'Liberar lock',
	forceReady: 'Forzar ready',
};

export const recoveryByLang: Readonly<Record<Lang, IRecoveryTranslations>> = {
	ar: recoveryEn,
	de: recoveryEn,
	en: recoveryEn,
	es: recoveryEs,
	fr: recoveryEn,
	hi: recoveryEn,
	it: recoveryEn,
	ja: recoveryEn,
	pt: recoveryEn,
	th: recoveryEn,
	vi: recoveryEn,
	zh: recoveryEn,
};
