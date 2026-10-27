/** Constants of the audit protocol: seats, Phase A and the evidence contract. */

/** Protocol state lives beside the reports, in a dot directory the report scan skips. */
export const AUDIT_PROTOCOL_DIR = '.audit';
export const AUDIT_SEATS_SUBDIR = 'seats';
export const AUDIT_PHASE_A_SUBDIR = 'phase-a';
export const AUDIT_CLOSURE_FILE = 'closure.json';

/** Seat and reviewer names are file names: no separators, no leading dot. */
export const AUDIT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

/** Share of the reviewers that must report a finding for it to count as consensus. */
export const DEFAULT_CONSENSUS_THRESHOLD = 0.5;

/** One required evidence field: its key and the labels (any language) that satisfy it. */
export const AUDIT_EVIDENCE_FIELDS: ReadonlyArray<{
	readonly key: string;
	readonly labels: readonly string[];
}> = [
	{ key: 'severity', labels: ['Severidad', 'Severity'] },
	{ key: 'state', labels: ['Estado', 'State', 'Status'] },
	{ key: 'component', labels: ['Componente', 'Component'] },
	{ key: 'location', labels: ['Ubicacion', 'Ubicación', 'Location'] },
	{
		key: 'reproduction',
		labels: ['Reproduccion', 'Reproducción', 'Reproduction'],
	},
	{
		key: 'recommendedFix',
		labels: [
			'Solucion recomendada',
			'Solución recomendada',
			'Recommended fix',
		],
	},
	{
		key: 'regressionTest',
		labels: [
			'Prueba de regresion',
			'Prueba de regresión',
			'Regression test',
		],
	},
	{ key: 'rootCause', labels: ['Causa raiz', 'Causa raíz', 'Root cause'] },
	{ key: 'expected', labels: ['Que deberia', 'Qué debería', 'Expected'] },
	{ key: 'actual', labels: ['Que ocurre', 'Qué ocurre', 'Actual'] },
	{ key: 'impact', labels: ['Impacto', 'Impact'] },
	{ key: 'evidence', labels: ['Evidencia', 'Evidence'] },
	{ key: 'snapshot', labels: ['Snapshot'] },
	{ key: 'relation', labels: ['Relacion', 'Relación', 'Relation'] },
	{ key: 'confidence', labels: ['Confianza', 'Confidence'] },
];

/** Normalised inventory states and the words that map to them. */
export const AUDIT_STATE_WORDS: ReadonlyArray<{
	readonly state: 'fixed' | 'rejected' | 'confirmed' | 'open';
	readonly re: RegExp;
}> = [
	{ state: 'fixed', re: /\b(?:fixed|resuelto|cerrado|closed|done)\b/iu },
	{ state: 'rejected', re: /\b(?:rejected|refutado|descartado|falso)\b/iu },
	{ state: 'confirmed', re: /\b(?:confirmed|confirmado|verificado)\b/iu },
];

/** Proposal folders whose proposals are active. */
export const ACTIVE_PROPOSAL_STATUS_DIRS: readonly string[] = [
	'in-progress',
	'ready',
	'review',
	'blocked',
	'paused',
];
