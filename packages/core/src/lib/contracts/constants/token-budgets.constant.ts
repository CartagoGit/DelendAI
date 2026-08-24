export type ITokenBudgetCeiling = {
	readonly hard: number;
	readonly warning: number;
	readonly releaseRelativePercent: number;
};

export type ITokenBudgetSurface = ITokenBudgetCeiling & {
	readonly marginalPluginHard?: number;
	readonly marginalPluginWarning?: number;
};

export type ITokenBudgetRegistry = {
	readonly bytesPerEstimatedToken: number;
	readonly fixturePluginIds: readonly string[];
	readonly dashboardPresetIds: readonly string[];
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
		readonly swarm: {
			readonly toolsList: ITokenBudgetSurface;
			readonly overviewCompact: ITokenBudgetSurface;
			readonly roundContext: ITokenBudgetSurface;
		};
		readonly lean: {
			readonly toolsList: ITokenBudgetSurface;
		};
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
	invariants: {
		compactVsFullMaxRatio: 0.7,
		leanVsSwarmToolsListMaxRatio: 0.4,
	},
	toolPayloads: {
		overviewFull: {
			hard: 10_700,
			warning: 10_600,
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
			hard: 6_800,
			warning: 6_500,
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
		swarm: {
			toolsList: {
				hard: 192_000,
				warning: 190_000,
				releaseRelativePercent: 20,
				marginalPluginHard: 80_000,
				marginalPluginWarning: 70_000,
			},
			overviewCompact: {
				hard: 6_100,
				warning: 6_000,
				releaseRelativePercent: 20,
			},
			roundContext: {
				hard: 300,
				warning: 250,
				releaseRelativePercent: 20,
			},
		},
		lean: {
			toolsList: {
				hard: 69_000,
				warning: 68_150,
				releaseRelativePercent: 20,
				marginalPluginHard: 30_000,
				marginalPluginWarning: 24_000,
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
