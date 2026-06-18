import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "コンセプト",
	"nav.install": "インストール",
	"nav.tools": "ツール",
	"nav.benchmarks": "ベンチマーク",
	"nav.plugins": "プラグイン",
	"nav.github": "GitHub",
	"hero.title.a": "プロジェクト非依存の ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": "",
	"hero.subheader": "あらゆるプロジェクト向けの MCP サーバーコア + プラグインローダー。",
	"hero.tagline":
		"プロジェクトに依存しない Model Context Protocol サーバーコア。コアはあなたのドメインを何も知りません——機能は必要に応じて読み込むプラグインとして提供され、すべて低トークンコストを目標に計測されています。",
	"hero.ctaInstall": "始める",
	"hero.ctaTools": "ツールを見る",
	"hero.runsOn": "Node・Deno・bun で動作 · 任意のパッケージマネージャ",
	"marquee.runtimes": "ビルド・実行環境",
	"marquee.clients": "MCP クライアントとモデル",
	"concept.title": "小さなコア、多くのプラグイン",
	"concept.body":
		"mcp-vertex は密閉されたコアです：決定論的なツール登録、注入されたワークスペースパス、CLI プラグインローダー、トークンで計測されたツール表面。ドメイン固有のものはすべてプラグイン——必要なものだけを、どのホストやモデルでも読み込みます。",
	"concept.f1.t": "プロジェクト非依存",
	"concept.f1.b":
		"コアにドメインコードはありません。同じプラグインがどのホストやモデルでも同一に動作します。",
	"concept.f2.t": "設計から低トークン",
	"concept.f2.b":
		"単一の overview、遅延ナレッジ、コンパクトな JSON。計測された予算が CI でのリグレッションを防ぎます。",
	"concept.f3.t": "安全な並行性",
	"concept.f3.b":
		"アトミック書き込み、所有権トークン付きのプロセス間ミューテックス、破損の隔離。",
	"concept.f4.t": "マルチエージェント対応",
	"concept.f4.b":
		"proposals プラグインがスウォームを調整：ロック、タスクキュー、スライスの互いに素、プッシュ通知。",
	"install.title": "インストールと実行",
	"install.lead": "追加して、MCP クライアントを mcp-vertex バイナリに向けます：",
	"install.verify": "起動を確認",
	"install.addto": "IDE / エージェントに追加",
	"install.presets": "プリセット：",
	"install.oneCmd": "1コマンド · どのIDEでも",
	"install.oneCmdNote": "IDE を自動検出して mcp-vertex を追加 — 他の MCP サーバーには一切触れません。",
	"install.config":
		"プリセット（minimal · standard · swarm）を選ぶか、プラグインを明示的に列挙します。--check で自己診断。",
	"tools.title": "ツール",
	"tools.lead":
		"フルプラグインセットが公開する全ツールを名前空間別にグループ化——ライブレジストリから取得するため、このページはコードから決して乖離しません。",
	"tools.count": "ツール",
	"tools.packages": "パッケージ",
	"bench.title": "主張ではなく計測",
	"bench.lead":
		"トークン効率は保護された不変条件——これらの上限が後退すると CI テストが失敗します。",
	"bench.b1.t": "コールドスタート",
	"bench.b1.b":
		"overview（コンパクト）+ auto_work——300 トークン未満で完全な方向付け。",
	"bench.b2.t": "ポーリングなし",
	"bench.b2.b":
		"ロック解放はプッシュ（notification プラグイン）、ループでポーリングしません。",
	"bench.b3.t": "ドリフト保護",
	"bench.b3.b":
		"生成型 SDK、トークン予算、実プロトコル上の厳格な e2e ネット。",
	"bench.live.title": "オリエンテーションのコスト · ライブ計測",
	"bench.live.note":
		"エージェントが見る結果テキストのトークン数（≈4バイト/トークン）を、proposals+memory でプロトコル上をライブ計測。ベースラインは手作業で方向付けする場合の参考推定で、第三者ツールの実測ではありません。",
	"bench.baseline": "mcp-vertex なし（手作業 · 推定）",
	"plugins.title": "プラグイン",
	"plugins.lead": "公開パッケージ。必要なものだけ読み込み、コアは極小のまま。",
	"cfg.title": "設定",
	"cfg.theme": "テーマ",
	"cfg.language": "言語",
	"cfg.motion": "アニメーション",
	"cfg.motionLabel": "マーキーをアニメーション",
	"footer.built": "ライブツールレジストリから生成。",
	"pluginpage.back": "戻る",
	"pluginpage.tools": "ツール",
	"pluginpage.install": "インストール",
	"plugin.proposals":
		"マルチエージェント調整：ロック、タスクキュー、スライス、round-context、状態修復。",
	"plugin.git": "読み取り専用のリポジトリ検査：status、変更ファイル、diff、log。",
	"plugin.memory":
		"セッション間で永続するノート。BM25 リコール、クォータ、TTL、シークレット秘匿。",
	"plugin.search":
		"低コストのワークスペース検索：部分文字列または正規表現、glob の include/exclude。",
	"plugin.rules": "フレームワーク検出 + lint/規約ガイド；プロジェクト設定が優先。",
	"plugin.quality":
		"品質ゲート（lint/test/build）を allow/deny ポリシーで実行；キャンセル可能。",
	"plugin.docs":
		"プロジェクトの markdown ドキュメントをカタログ化して読む、低コストの厳選ナビ。",
	"plugin.deps":
		"オフライン依存関係の棚卸し + 健全性（lockfile、緩い範囲、重複）。",
	"plugin.notification": "ロック解放イベントをプッシュし、エージェントのポーリングを止めます。",
	"plugin.core": "非依存のコア：overview、scaffold、メトリクス、doctor、プラグインローダー。",
};

export default dict;
export { dict };