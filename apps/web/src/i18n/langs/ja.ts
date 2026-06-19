import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'コンセプト',
		install: 'インストール',
		tools: 'ツール',
		benchmarks: 'ベンチマーク',
		plugins: 'プラグイン',
		github: 'GitHub',
		resources: 'リソース',
		skills: 'スキル',
		guide: 'ガイド',
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
		config: 'プリセット（minimal · standard · swarm）を選ぶか、プラグインを明示的に列挙します。--check で自己診断。',
		excludeHelp:
			'--exclude-plugins=（別名：--excludePlugins=）で解決済みセットからプラグインを除外できます。フォークせずにプリセットから外すのに便利 — 例：--preset=swarm --exclude-plugins=notification は単一エージェントセッション向け。',
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
	footer: {
		built: 'ライブツールレジストリから生成。',
		tagline:
			'プロジェクトに依存しない MCP サーバーコア + プラグインローダー。',
		sections: 'セクション',
		resources: 'リソース',
	},
	pluginpage: { back: '戻る', tools: 'ツール', install: 'インストール' },
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
		'status-marker':
			'エージェント応答ごとに必須のカラー終了マーカー：8 つの正規状態、ヘルパーとバリデータのツール。',
		core: '非依存のコア：overview、scaffold、メトリクス、doctor、プラグインローダー。',
	},
	knowledge: {
		title: 'Knowledge',
		lead: 'Catalogued documents the core can answer questions about.',
		count: 'documents',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Reusable prompt templates exposed by the core.',
		count: 'prompts',
		arg: 'arguments',
	},
	resources: {
		title: 'Resources',
		lead: 'Static resources bundled with the project (URI + MIME).',
		count: 'resources',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Domain playbooks the agent can load on demand.',
		count: 'skills',
		body: 'Body',
	},
	notFound: {
		code: '404',
		title: 'ページが見つかりません',
		lead: 'お探しのページは存在しないか、移動されました。コアはプロジェクトに依存しないままです — 壊れた URL に対しても。',
		homeCta: 'ホームへ戻る',
		toolsCta: 'ツールを見る',
		homeAria: 'ホームへ移動',
	},
};

export default dict;
