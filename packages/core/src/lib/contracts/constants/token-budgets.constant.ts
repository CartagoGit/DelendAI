export type ITokenBudgetCeiling = {
	readonly hard: number;
	readonly warning: number;
	readonly releaseRelativePercent: number;
};

export type ITokenBudgetSurface = ITokenBudgetCeiling & {
	readonly marginalPluginHard?: number;
	readonly marginalPluginWarning?: number;
};

export type IPresetTokenBudgetProfile = {
	readonly toolsList: ITokenBudgetSurface;
	readonly overviewCompact?: ITokenBudgetSurface;
	readonly roundContext?: ITokenBudgetSurface;
};

export type ITokenBudgetRegistry = {
	readonly bytesPerEstimatedToken: number;
	readonly fixturePluginIds: readonly string[];
	readonly dashboardPresetIds: readonly string[];
	readonly governedPresetIds: readonly string[];
	readonly invariants: {
		readonly compactVsFullMaxRatio: number;
		readonly leanVsSwarmToolsListMaxRatio: number;
	};
	readonly toolPayloads: {
		readonly overviewFull: ITokenBudgetSurface;
		readonly overviewCompact: ITokenBudgetSurface;
		readonly agentCatalogCompact: ITokenBudgetSurface;
		readonly agentCatalogFull: ITokenBudgetSurface;
		readonly autoWork: ITokenBudgetSurface;
		readonly search: ITokenBudgetSurface;
		readonly docsList: ITokenBudgetSurface;
		readonly roundContext: ITokenBudgetSurface;
		readonly logsTail: ITokenBudgetSurface;
		readonly analyzeCompact: ITokenBudgetSurface;
		readonly planCompact: ITokenBudgetSurface;
	};
	readonly presets: {
		readonly minimal: IPresetTokenBudgetProfile;
		readonly lean: IPresetTokenBudgetProfile;
		readonly standard: IPresetTokenBudgetProfile;
		readonly swarm: IPresetTokenBudgetProfile;
		readonly full: IPresetTokenBudgetProfile;
		readonly vertex: IPresetTokenBudgetProfile;
	};
	readonly bumpPolicy: {
		readonly summary: string;
		readonly requiredSteps: readonly string[];
	};
};

export const TOKEN_BUDGETS: ITokenBudgetRegistry = {
	bytesPerEstimatedToken: 4,
	fixturePluginIds: ['proposals', 'memory'],
	dashboardPresetIds: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'vertex',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	governedPresetIds: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'vertex',
	],
	invariants: {
		compactVsFullMaxRatio: 0.7,
		leanVsSwarmToolsListMaxRatio: 0.4,
	},
	toolPayloads: {
		overviewFull: {
			// r00014 keeps bootstrap lean, but the current real tool roster
			// measures slightly above the previous ceiling (~11_060 B).
			hard: 11_100,
			warning: 11_000,
			releaseRelativePercent: 20,
		},
		overviewCompact: {
			hard: 1_500,
			warning: 1_450,
			releaseRelativePercent: 20,
		},
		agentCatalogCompact: {
			hard: 900,
			warning: 800,
			releaseRelativePercent: 20,
		},
		agentCatalogFull: {
			// adds portable skill metadata and the orchestrator roster
			// to the explicit full drill-down. Compact remains the default
			// orientation surface; this ceiling covers the measured full payload
			// with a bounded margin instead of dropping useful metadata.
			hard: 9_000,
			warning: 8_500,
			releaseRelativePercent: 20,
		},
		autoWork: {
			hard: 2_600,
			warning: 2_400,
			releaseRelativePercent: 20,
		},
		search: {
			hard: 3_000,
			warning: 2_700,
			releaseRelativePercent: 20,
		},
		docsList: {
			hard: 2_500,
			warning: 2_200,
			releaseRelativePercent: 20,
		},
		roundContext: {
			hard: 3_000,
			warning: 2_700,
			releaseRelativePercent: 20,
		},
		logsTail: {
			hard: 6_000,
			warning: 5_500,
			releaseRelativePercent: 20,
		},
		analyzeCompact: {
			hard: 1_800,
			warning: 1_600,
			releaseRelativePercent: 20,
		},
		planCompact: {
			hard: 2_000,
			warning: 1_800,
			releaseRelativePercent: 20,
		},
	},
	presets: {
		minimal: {
			toolsList: {
				hard: 64_000,
				warning: 58_000,
				releaseRelativePercent: 20,
			},
		},
		lean: {
			toolsList: {
				// The stable bootstrap registrations are present in
				// the native measurement baseline too; the current 69,115 B
				// roster needs a small, explicit guard band.
				hard: 70_000,
				warning: 69_000,
				releaseRelativePercent: 20,
				marginalPluginHard: 30_000,
				marginalPluginWarning: 24_000,
			},
		},
		standard: {
			toolsList: {
				hard: 144_000,
				warning: 132_000,
				releaseRelativePercent: 20,
			},
		},
		swarm: {
			toolsList: {
				// q00009: managed is now the silent default, so the dynamic
				// surface tools (project_context, tool_search,
				// plugin_activate, plugin_deactivate, vertex router) are
				// ALWAYS registered. The runtime gates exposure per-client,
				// but the registrations themselves cost ~5kB on top of the
				// previous baseline. The bump covers that cost plus a small
				// safety margin for the next preset drift.
				hard: 210_000,
				warning: 204_000,
				releaseRelativePercent: 20,
				marginalPluginHard: 80_000,
				marginalPluginWarning: 70_000,
			},
			overviewCompact: {
				// added auto-agent-selector; the current compact swarm
				// surface now measures ~6_426 B with the live plugin mix.
				hard: 6_450,
				warning: 6_350,
				releaseRelativePercent: 20,
			},
			roundContext: {
				hard: 300,
				warning: 250,
				releaseRelativePercent: 20,
			},
		},
		full: {
			toolsList: {
				hard: 256_000,
				warning: 236_000,
				releaseRelativePercent: 20,
			},
		},
		vertex: {
			toolsList: {
				hard: 384_000,
				warning: 320_000,
				releaseRelativePercent: 20,
			},
		},
	},
	bumpPolicy: {
		summary:
			'Any ceiling increase must be deliberate: justify the cost, show the benefit, attempt a compensation, and document the decision in this contract and the generated report.',
		requiredSteps: [
			'justify-the-cost',
			'show-the-benefit',
			'attempt-a-compensation',
			'document-the-decision',
		],
	},
};
