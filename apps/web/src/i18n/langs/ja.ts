import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'コンセプト',
		install: 'インストール',
		tools: 'ツール',
		benchmarks: 'ベンチマーク',
		plugins: 'プラグイン',
		presets: 'プリセット',
		github: 'GitHub',
		menu: 'メニュー',
		knowledge: 'ナレッジ',
		prompts: 'プロンプト',
		resources: 'リソース',
		skills: 'スキル',
		guide: 'ガイド',
		more: 'その他',
		firstFiveMinutes: '最初の5分',
		troubleshooting: 'トラブルシューティング',
	},
	hero: {
		title: { a: 'プロジェクト非依存の ', b: 'MCP Vertex', c: '' },
		subheader:
			'あらゆるプロジェクト向けの MCP サーバーコア + プラグインローダー。',
		tagline:
			'プロジェクトに依存しない Model Context Protocol サーバーコア。コアはあなたのドメインを何も知りません——機能は必要に応じて読み込むプラグインとして提供され、すべて低トークンコストを目標に計測されています。',
		ctaInstall: '始める',
		ctaTools: 'ツールを見る',
		runsOn: 'Node・Deno・bun で動作 · 任意のパッケージマネージャ',
	},
	marquee: {
		runtimes: 'ビルド・実行環境',
		clients: 'MCP クライアントとモデル',
	},
	concept: {
		title: '小さなコア、多くのプラグイン',
		body: 'mcp-vertex は密閉されたコアです：決定論的なツール登録、注入されたワークスペースパス、CLI プラグインローダー、トークンで計測されたツール表面。ドメイン固有のものはすべてプラグイン——必要なものだけを、どのホストやモデルでも読み込みます。',
		f1: {
			t: 'プロジェクト非依存',
			b: 'コアにドメインコードはありません。同じプラグインがどのホストやモデルでも同一に動作します。',
		},
		f2: {
			t: '設計から低トークン',
			b: '単一の overview、遅延ナレッジ、コンパクトな JSON。計測された予算が CI でのリグレッションを防ぎます。',
		},
		f3: {
			t: '安全な並行性',
			b: 'アトミック書き込み、所有権トークン付きのプロセス間ミューテックス、破損の隔離。',
		},
		f4: {
			t: 'マルチエージェント対応',
			b: 'proposals プラグインがスウォームを調整：ロック、タスクキュー、スライスの互いに素、プッシュ通知。',
		},
	},
	install: {
		title: 'インストールと実行',
		lead: '追加して、MCP クライアントを mcp-vertex バイナリに向けます：',
		verify: '起動を確認',
		addto: 'IDE / エージェントに追加',
		presets: 'プリセット：',
		oneCmd: '1コマンド · どのIDEでも',
		oneCmdNote:
			'IDE を自動検出して mcp-vertex を追加 — 他の MCP サーバーには一切触れません。',
		config: 'プリセット（minimal · standard · swarm · full）を選ぶか、プラグインを明示的に列挙します。--check で自己診断。',
		excludeHelp:
			'--exclude-plugins=（別名：--excludePlugins=）で解決済みセットからプラグインを除外できます。フォークせずにプリセットから外すのに便利 — 例：--preset=swarm --exclude-plugins=notification は単一エージェントセッション向け。',
		tabsPackageManager: 'パッケージマネージャ',
		tabsIde: 'IDE / エージェント',
		tabsPreset: 'プリセット',
		pmStep1Title: '1. 初期化',
		pmStep1Body:
			'ワンコマンドのインストーラを実行します。エディタを検出し、設定をマージして、何を行ったかを表示します。',
		pmStep2Title: '2. 検証',
		pmStep2Body:
			'同じパッケージマネージャに `--check` を付けて自己診断します。',
		pmRecommend: '推奨',
		ideFileLabel: '設定ファイル',
		ideScopeLabel: 'スコープ',
		ideScopeProject: 'プロジェクト',
		ideScopeGlobal: 'グローバル',
		ideScopeBoth: 'プロジェクト / グローバル',
		ideWhyLabel: 'なぜこの形？',
		ideWhyBody:
			'IDE ごとに少しずつ異なる JSON キー（`mcpServers`、`servers`、`context_servers`）とパスを使います。レンダラーが自動で合わせるため、そのまま貼り付けてください。',
		presetSizeLabel: 'プラグイン',
		presetUseLabel: '用途',
		presetPluginsLabel: '含まれるプラグイン',
		presetFoot:
			'`--preset=<name>` で任意のプリセットをサーバーに渡せます。プリセットは加算的です — フォークせずに `--include-plugins=` と `--exclude-plugins=` を組み合わせて微調整できます。',
		copy: 'コピー',
		copied: 'コピーしました！',
		faqTitle: 'よくある質問',
		faqQ1: 'なぜ `deno run -A npm:@mcp-vertex/core` の起動は遅い？',
		faqA1: 'Deno は初回使用時に npm パッケージを解決・検証します。以降の実行は `~/.cache/deno` のキャッシュを再利用します。繰り返し起動するなら bun か npx を推奨。',
		faqQ2: 'IDE がリストにない — どうすれば？',
		faqA2: 'stdio MCP サーバーを受け入れる任意の IDE で動作します。VS Code の JSON をコピーし、ファイルパスをその IDE が期待するものに変更し、同じコマンド + 引数を登録してください。',
		faqQ3: '複数のプリセットを同時に実行できますか？',
		faqA3: 'いいえ — 1 つのサーバーに 1 つのプリセットです。プロジェクトごとに異なるプラグインセットが必要な場合は、そのプロジェクトに `mcp-vertex.config.json` を置くとローダーが最初に読みます。',
	},
	tools: {
		title: 'ツール',
		lead: 'フルプラグインセットが公開する全ツールを名前空間別にグループ化——ライブレジストリから取得するため、このページはコードから決して乖離しません。',
		count: 'ツール',
		packages: 'パッケージ',
	},
	bench: {
		title: '主張ではなく計測',
		lead: 'トークン効率は保護された不変条件——これらの上限が後退すると CI テストが失敗します。',
		b1: {
			t: 'コールドスタート',
			b: 'overview（コンパクト）+ auto_work——300 トークン未満で完全な方向付け。',
		},
		b2: {
			t: 'ポーリングなし',
			b: 'ロック解放はプッシュ（notification プラグイン）、ループでポーリングしません。',
		},
		b3: {
			t: 'ドリフト保護',
			b: '生成型 SDK、トークン予算、実プロトコル上の厳格な e2e ネット。',
		},
		live: {
			title: 'オリエンテーションのコスト · ライブ計測',
			note: 'エージェントが見る結果テキストのトークン数（≈4バイト/トークン）を、proposals+memory でプロトコル上をライブ計測。ベースラインは手作業で方向付けする場合の参考推定で、第三者ツールの実測ではありません。',
		},
		baseline: 'mcp-vertex なし（手作業 · 推定）',
	},
	plugins: {
		title: 'プラグイン',
		lead: '公開パッケージ。必要なものだけ読み込み、コアは極小のまま。',
	},
	cfg: {
		title: '設定',
		theme: 'テーマ',
		language: '言語',
		motion: 'アニメーション',
		motionLabel: 'マーキーをアニメーション',
	},
	search: {
		title: '検索',
		placeholder: 'サイト内を検索...',
	},
	footer: {
		built: 'ライブツールレジストリから生成。',
		tagline:
			'プロジェクトに依存しない MCP サーバーコア + プラグインローダー。',
		sections: 'セクション',
		resources: 'リソース',
		madeBy: 'Cartago が作成 · @CartagoGit (GitHub)',
		creatorsRepo: '作者 (GitHub)',
		creatorsNpm: '作者 (npm)',
	},
	pluginpage: {
		back: '戻る',
		tools: 'ツール',
		install: 'インストール',
		tabInstall: 'インストール',
		tabTools: 'ツール',
		tabConfiguration: '設定',
		tabTutorial: 'チュートリアル',
	},
	plugin: {
		proposals:
			'マルチエージェント調整：ロック、タスクキュー、スライス、round-context、状態修復。',
		git: '読み取り専用のリポジトリ検査：status、変更ファイル、diff、log。',
		memory: 'セッション間で永続するノート。BM25 リコール、クォータ、TTL、シークレット秘匿。',
		search: '低コストのワークスペース検索：部分文字列または正規表現、glob の include/exclude。',
		rules: 'フレームワーク検出 + lint/規約ガイド；プロジェクト設定が優先。',
		quality:
			'品質ゲート（lint/test/build）を allow/deny ポリシーで実行；キャンセル可能。',
		docs: 'プロジェクトの markdown ドキュメントをカタログ化して読む、低コストの厳選ナビ。',
		deps: 'オフライン依存関係の棚卸し + 健全性（lockfile、緩い範囲、重複）。',
		notification:
			'ロック解放イベントをプッシュし、エージェントのポーリングを止めます。',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'エージェント応答ごとに必須のカラー終了マーカー：8 つの正規状態、ヘルパーとバリデータのツール。',
		core: '非依存のコア：overview、scaffold、メトリクス、doctor、プラグインローダー。',
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
	},
	toolpage: {
		back: '戻る',
		backToPlugin: 'プラグインに戻る',
		arguments: '引数',
		argName: '引数名',
		argType: '型',
		argRequired: '必須',
		argDescription: '説明',
		argRequiredYes: 'はい',
		argRequiredNo: 'いいえ',
		noArguments: 'このツールは引数を取りません。',
		effects: '副作用',
		effectReadOnly: '読み取り専用',
		example: '呼び出しの例',
		exampleNote:
			'汎用的な MCP ツール呼び出しのペイロードとして表示しています。実際のトランスポートはクライアントによって異なります。',
		plugin: 'プラグイン',
	},
	firstFiveMinutes: {
		title: '最初の5分',
		lead: 'コピー＆ペーストで使える3つのクイックスタート。mcp-vertex の実行方法に合うものを選んでください。',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — サーバーを直接実行',
			intro: 'エディタ統合は不要です。ターミナルから host server を実行し、任意の MCP クライアントをその stdio トランスポートに向けます。',
			steps: [
				'インストール：`bun add @mcp-vertex/core`（または `npm install @mcp-vertex/core`）。',
				'実行：`bunx mcp-vertex --preset=standard`（または `npx mcp-vertex --preset=standard`）。',
				'確認：プロセスが読み込んだプラグイン一覧を表示し、stdio で待機します — 停止するには Ctrl+C。',
				'MCP クライアントの設定をこのバイナリに向け、`--preset=minimal|standard|swarm|full` を指定します（フラグの全リストはインストールページを参照）。',
				'最初に `mcp-vertex_overview { compact: true }` を呼び出してください — 次に何をすべきか教えてくれます。',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: '1コマンドインストーラーが VS Code を検出し、既存のサーバーに触れずに mcp-vertex を MCP サーバー一覧に追加します。',
			steps: [
				'インストールページから1コマンドインストーラーを実行します（IDE を自動検出）。',
				'ウィンドウを再読み込み（`Developer: Reload Window`）して、Copilot が新しいサーバーを認識できるようにします。',
				'Copilot のチャットパネルを開き、エージェント選択で `mcp-vertex` エージェントを選びます。',
				'`mcp-vertex_overview` を呼び出してもらいます — 読み込まれたプリセットと推奨される次のアクションが報告されるはずです。',
				'サーバーが表示されない場合は、トラブルシューティング → "MCP server not detected" を参照してください。',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code はワークスペースルートの `.mcp.json` を読み込みます。インストーラーがこのファイルを作成またはマージします。',
			steps: [
				'1コマンドインストーラーを実行します — Claude Code を検出して `.mcp.json` を書き込みます。',
				'Claude Code を再起動（または `/mcp` を実行してサーバーを再読み込み）して、新しいエントリを認識させます。',
				'新しいセッションでは、常に読み込まれる `AGENTS.md` + `CLAUDE.md` が最初の呼び出しとして既に `mcp-vertex_overview` を指しています。',
				'`mcp-vertex_overview { compact: true }` で確認してください — `recommendedNextAction` フィールドが次に何をすべきか教えてくれます。',
				'マルチエージェントのセッションでは、スライスを claim する前に `mcp-vertex-proposal-swarm-runner` スキルを読んでください。',
			],
		},
		nextSteps: '次に進む先',
		nextToolsCta: 'すべてのツールを見る',
		nextTroubleshootingCta: '何か動かない？トラブルシューティング',
	},
	troubleshooting: {
		title: 'トラブルシューティング',
		lead: '実際に報告された問題について、症状 → 推定される原因 → 対処法。',
		symptom: '症状',
		cause: '推定される原因',
		fix: '対処法',
		tags: 'タグ',
		backToIndex: 'トラブルシューティングに戻る',
		closedBy: 'クローズ対応',
		empty: 'このフィルタに一致するトラブルシューティングのケースはまだありません。',
	},
	knowledge: {
		title: 'ナレッジ',
		lead: 'コアが質問に答えられるようカタログ化されたドキュメント。',
		count: 'ドキュメント',
	},
	prompts: {
		title: 'プロンプト',
		lead: 'コアが公開する再利用可能なプロンプトテンプレート。',
		count: 'プロンプト',
		arg: '引数',
	},
	resources: {
		title: 'リソース',
		lead: 'プロジェクトに同梱された静的リソース（URI + MIME）。',
		count: 'リソース',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'スキル',
		lead: 'エージェントがオンデマンドで読み込めるドメインのプレイブック。',
		count: 'スキル',
		body: '本文',
	},
	notFound: {
		code: '404',
		title: 'ページが見つかりません',
		lead: 'お探しのページは存在しないか、移動されました。コアはプロジェクトに依存しないままです — 壊れた URL に対しても。',
		homeCta: 'ホームへ戻る',
		toolsCta: 'ツールを見る',
		homeAria: 'ホームへ移動',
	},
	proposals: proposalGlossaryByLang.ja,
	recovery: recoveryByLang.ja,
	logs: logsByLang.ja,
	presets: {
		title: 'プリセット',
		lead: 'さまざまなワークスペースのサイズに合わせて事前構成されたプラグインのセット。',
		summary:
			'このリポジトリには、プリセット全体で {count} 個の固有のプラグインが含まれています。',
		hostOnlyChip: 'ホストのみ',
		installTitle: '使い方',
		installLead: 'MCP サーバーの起動時に --preset フラグを指定します。',
		table: {
			preset: 'プリセット',
		},
	},
	setup: {
		title: 'クロスプロジェクト設定',
		lead: '任意のリポジトリに mcp-vertex を組み込み、そのリポジトリ向けに GitHub issues プラグインを準備します。setup-github コマンドが実行するのと同じ 7 ステップです。',
		stepsTitle: '7 つのステップ',
		docsLinkLabel: '正規のクロスプロジェクト設定ガイドを読む',
		detectRepoTitle: 'リポジトリの検出',
		detectRepoBody:
			'GitHub のリモートを読み取り owner/name に正規化します。検出されたスラッグは想定するリポジトリを指している必要があります。',
		confirmRepoTitle: 'owner/name の確認',
		confirmRepoBody:
			'セットアップコマンドを実行し、何かを書き込む前に検出されたスラッグを確認（または上書き）します。',
		pickAuthTierTitle: '認証ティアの選択',
		pickAuthTierBody:
			'gh auth status が成功すれば gh、GITHUB_TOKEN が設定されていれば rest-authed、それ以外は rest-anon（毎時 60 リクエスト上限）を使用します。',
		writeConfigTitle: '設定の書き込み',
		writeConfigBody:
			'他のプラグイン設定に触れずに plugins.issues.options.repo を mcp-vertex.config.json に書き込みます。',
		verifyTierTitle: 'ティアの検証',
		verifyTierBody:
			'issues プラグインを読み込んだ状態でホストを起動し、選択した認証ティアをエンドツーエンドで検証します。',
		printInvocationTitle: '起動コマンドの出力',
		printInvocationBody:
			'このサーバーブロックを mcp.json に追加します。形は VS Code、Cursor、Claude Code で同じです。',
		markConfiguredTitle: '設定済みとしてマーク',
		markConfiguredBody:
			'このリポジトリが一度設定済みであることを任意で記録し、以降の実行でプロンプトを省略できるようにします。',
		optionalLabel: '任意',
	},
	ui: {
		codeCopy: 'コピー',
		codeCopied: 'コピーしました！',
		codeCollapse: '折りたたむ',
		codeExpand: '展開',
		calloutNote: 'メモ',
		calloutTip: 'ヒント',
		calloutWarn: '注意',
		calloutDanger: '危険',
		tabsNext: '次へ',
		tabsPrev: '前へ',
		stepsOf: '/',
	},
};

export default dict;
