// filepath: apps/shared/src/i18n/langs/vi.ts
//
// S2 — merged language dictionary for `vi`. Site section lifted
// from apps/web/src/i18n/langs/vi.ts with the proposals/recovery/logs
// references inlined from apps/web/src/i18n/{proposals,logs}.ts. Extension
// section lifted from extensions/vscode/src/i18n/langs/vi.ts. Tools
// section is reserved for future per-tool result translations.

import type { ILangDict } from '../shared';

const proposals = {
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
			long: 'Imported proposal from the pre-f00016 workflow.',
		},
	},
};
const recovery = {
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
const logs = {
	page_title: 'Logs',
	lead: 'Redacted MCP event timeline for tool calls, agents and recovery signals.',
	empty: 'No log events are available in the static snapshot.',
	filter_outcome: 'Outcome',
	filter_agent: 'Agent',
	filter_task: 'Task',
	copyTask: 'Copy task id',
	outcomes: {
		ok: 'OK',
		failed: 'Failed',
		timed_out: 'Timed out',
		cancelled: 'Cancelled',
		dead: 'Dead',
		idle: 'Idle',
		unknown: 'Unknown',
	},
	columns: {
		ts: 'Time',
		kind: 'Kind',
		agent: 'Agent',
		task: 'Task',
		outcome: 'Outcome',
		summary: 'Summary',
	},
};

const site = {
	nav: {
		concept: 'Khái niệm',
		install: 'Cài đặt',
		tools: 'Công cụ',
		benchmarks: 'Benchmark',
		plugins: 'Plugin',
		presets: 'Preset',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Kiến thức',
		prompts: 'Prompt',
		resources: 'Tài nguyên',
		skills: 'Kỹ năng',
		guide: 'Hướng dẫn',
		more: 'Thêm',
		firstFiveMinutes: '5 phút đầu tiên',
		troubleshooting: 'Khắc phục sự cố',
	},
	hero: {
		title: { a: '', b: 'MCP Vertex', c: ' bất khả tri với dự án' },
		subheader: 'Lõi máy chủ MCP + trình tải plugin cho mọi dự án.',
		tagline:
			'Một lõi máy chủ Model Context Protocol bất khả tri với dự án. Lõi không biết gì về lĩnh vực của bạn — các khả năng đến dưới dạng plugin bạn tải theo nhu cầu, tất cả đều được đo lường để chi phí token thấp.',
		ctaInstall: 'Bắt đầu',
		ctaTools: 'Xem công cụ',
		runsOn: 'Chạy trên Node, Deno và bun · mọi trình quản lý gói',
	},
	marquee: {
		runtimes: 'Xây bằng · chạy trên',
		clients: 'Client MCP & mô hình',
	},
	concept: {
		title: 'Một lõi nhỏ, nhiều plugin',
		body: 'mcp-vertex là lõi kín: đăng ký công cụ tất định, đường dẫn workspace được tiêm vào, trình tải plugin qua CLI, và bề mặt công cụ đo bằng token. Mọi thứ riêng cho lĩnh vực đều là plugin — chỉ tải thứ bạn cần, dưới mọi host hay mô hình.',
		f1: {
			t: 'Bất khả tri với dự án',
			b: 'Không có mã lĩnh vực trong lõi. Cùng một plugin hoạt động giống hệt dưới mọi host hay mô hình.',
		},
		f2: {
			t: 'Ít token theo thiết kế',
			b: 'Một overview, kiến thức lười và JSON gọn. Một ngân sách được đo bảo vệ khỏi thoái lui trong CI.',
		},
		f3: {
			t: 'Đồng thời an toàn',
			b: 'Ghi nguyên tử, mutex liên tiến trình với token sở hữu, và cách ly hỏng hóc.',
		},
		f4: {
			t: 'Sẵn sàng đa tác tử',
			b: 'Plugin proposals điều phối một swarm: khóa, hàng đợi tác vụ, slice rời nhau và thông báo đẩy.',
		},
	},
	install: {
		title: 'Cài đặt & chạy',
		lead: 'Thêm nó và trỏ client MCP của bạn tới binary mcp-vertex:',
		verify: 'Kiểm tra nó chạy',
		addto: 'Thêm vào IDE / tác tử của bạn',
		presets: 'Preset:',
		oneCmd: 'Một lệnh · mọi IDE',
		oneCmdNote:
			'Tự phát hiện IDE và thêm mcp-vertex — không đụng tới các MCP server khác của bạn.',
		config: 'Chọn một preset (minimal · standard · swarm · full) hoặc liệt kê plugin tường minh. Chạy với --check để tự chẩn đoán.',
		excludeHelp:
			'Trừ plugin khỏi tập đã giải bằng --exclude-plugins= (bí danh: --excludePlugins=). Hữu ích để loại một plugin khỏi preset mà không fork — ví dụ --preset=swarm --exclude-plugins=notification cho phiên đơn tác tử.',
		tabsPackageManager: 'Trình quản lý gói',
		tabsIde: 'IDE / tác tử',
		tabsPreset: 'Preset',
		pmStep1Title: '1. Khởi tạo',
		pmStep1Body:
			'Chạy trình cài một lệnh. Nó phát hiện trình soạn thảo, hợp nhất cấu hình và in ra những gì đã làm.',
		pmStep2Title: '2. Kiểm tra',
		pmStep2Body:
			'Chạy cùng trình quản lý gói với `--check` để tự chẩn đoán.',
		pmRecommend: 'Được khuyến nghị',
		ideFileLabel: 'Tệp cấu hình',
		ideScopeLabel: 'Phạm vi',
		ideScopeProject: 'dự án',
		ideScopeGlobal: 'toàn cục',
		ideScopeBoth: 'dự án / toàn cục',
		ideWhyLabel: 'Sao lại hình này?',
		ideWhyBody:
			'Mỗi IDE dùng khóa JSON hơi khác (`mcpServers`, `servers`, `context_servers`) và đường dẫn khác. Trình kết xuất tự thích nghi — dán nguyên si là chạy.',
		presetSizeLabel: 'plugin',
		presetUseLabel: 'Dùng cho',
		presetPluginsLabel: 'Plugin đi kèm',
		presetFoot:
			'Truyền preset bất kỳ cho server bằng `--preset=<tên>`. Preset cộng dồn — kết hợp `--include-plugins=` và `--exclude-plugins=` để tinh chỉnh mà không fork.',
		copy: 'Sao chép',
		copied: 'Đã sao chép!',
		faqTitle: 'Câu hỏi thường gặp',
		faqQ1: 'Sao `deno run -A npm:@mcp-vertex/core` khởi động chậm?',
		faqA1: 'Deno giải và xác minh gói npm ở lần dùng đầu. Các lần sau dùng lại cache trong `~/.cache/deno`. Cho khởi động lặp lại, hãy ưu tiên bun hoặc npx.',
		faqQ2: 'IDE của tôi không có trong danh sách — giờ sao?',
		faqA2: 'Bất kỳ IDE nào chấp nhận MCP server stdio đều chạy được. Lấy JSON từ VS Code, đổi đường dẫn tệp cho khớp IDE của bạn, rồi đăng ký cùng lệnh + đối số.',
		faqQ3: 'Tôi có thể chạy nhiều preset cùng lúc không?',
		faqA3: 'Không — một server, một preset. Nếu mỗi dự án cần bộ plugin khác, đặt một `mcp-vertex.config.json` trong dự án đó và loader đọc nó trước.',
	},
	tools: {
		title: 'Công cụ',
		lead: 'Mọi công cụ mà bộ plugin đầy đủ phơi bày, nhóm theo namespace — lấy từ registry sống, nên trang này không bao giờ lệch khỏi mã.',
		count: 'công cụ',
		packages: 'gói',
	},
	bench: {
		title: 'Đo lường, không tuyên bố',
		lead: 'Hiệu quả token là một bất biến được bảo vệ — một test CI thất bại nếu các trần này thoái lui.',
		b1: {
			t: 'khởi động nguội',
			b: 'overview (gọn) + auto_work — định hướng đầy đủ dưới 300 token.',
		},
		b2: {
			t: 'không polling',
			b: 'giải phóng khóa được đẩy (plugin notification), không hỏi vòng lặp.',
		},
		b3: {
			t: 'chống trôi',
			b: 'một SDK kiểu sinh tự động, ngân sách token và lưới e2e nghiêm ngặt trên giao thức thật.',
		},
		live: {
			title: 'Chi phí định hướng · đo trực tiếp',
			note: 'Token của văn bản kết quả mà tác tử thấy (≈4 byte/token), đo trực tiếp qua giao thức với proposals+memory. Đường cơ sở là ước tính minh họa cho việc định hướng thủ công — không phải số đo của công cụ bên thứ ba.',
		},
		baseline: 'không có mcp-vertex (thủ công · ước tính)',
	},
	plugins: {
		title: 'Plugin',
		lead: 'Các gói đã phát hành. Chỉ tải thứ cần; lõi vẫn nhỏ gọn.',
	},
	cfg: {
		title: 'Cài đặt',
		theme: 'Giao diện',
		language: 'Ngôn ngữ',
		motion: 'Chuyển động',
		motionLabel: 'Hoạt họa các marquee',
	},
	search: {
		title: 'Tìm kiếm',
		placeholder: 'Tìm kiếm trên trang...',
	},
	footer: {
		built: 'Sinh từ registry công cụ sống.',
		tagline: 'Lõi máy chủ MCP không phụ thuộc dự án + bộ nạp plugin.',
		sections: 'Mục',
		resources: 'Tài nguyên',
		madeBy: 'Tạo bởi Cartago · @CartagoGit trên GitHub',
		creatorsRepo: 'Tác giả trên GitHub',
		creatorsNpm: 'Tác giả trên npm',
	},
	pluginpage: {
		back: 'Quay lại',
		tools: 'Công cụ',
		install: 'Cài đặt',
		tabInstall: 'Cài đặt',
		tabTools: 'Công cụ',
		tabConfiguration: 'Cấu hình',
		tabTutorial: 'Hướng dẫn',
	},
	plugin: {
		proposals:
			'Điều phối đa tác tử: khóa, hàng đợi tác vụ, slice, round-context, sửa trạng thái.',
		git: 'Kiểm tra kho chỉ đọc: status, tệp thay đổi, diff, log.',
		memory: 'Ghi chú bền giữa các phiên với recall BM25, hạn ngạch, TTL và che giấu bí mật.',
		search: 'Tìm kiếm workspace chi phí thấp: chuỗi con hoặc regex, glob bao gồm/loại trừ.',
		rules: 'Phát hiện framework + hướng dẫn lint/quy ước; cấu hình dự án thắng.',
		quality:
			'Chạy cổng chất lượng (lint/test/build) với chính sách allow/deny; có thể hủy.',
		docs: 'Lập danh mục và đọc tài liệu markdown của dự án, điều hướng tuyển chọn chi phí thấp.',
		deps: 'Kiểm kê phụ thuộc ngoại tuyến + sức khỏe (lockfile, phạm vi lỏng, trùng lặp).',
		notification:
			'Đẩy sự kiện giải phóng khóa để các tác tử ngừng polling.',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'Đánh dấu kết thúc màu bắt buộc cho mỗi phản hồi của tác tử: 8 trạng thái chuẩn, công cụ helper + validator.',
		core: 'Lõi bất khả tri: overview, scaffold, số liệu, doctor và trình tải plugin.',
	},
	toolpage: {
		back: 'Quay lại',
		backToPlugin: 'Quay lại plugin',
		arguments: 'Đối số',
		argName: 'Đối số',
		argType: 'Kiểu',
		argRequired: 'Bắt buộc',
		argDescription: 'Mô tả',
		argRequiredYes: 'có',
		argRequiredNo: 'không',
		noArguments: 'Công cụ này không nhận đối số nào.',
		effects: 'Hiệu ứng',
		effectReadOnly: 'chỉ đọc',
		example: 'Ví dụ gọi',
		exampleNote:
			'Hiển thị như một payload gọi công cụ MCP chung; phương thức truyền tải chính xác phụ thuộc vào client của bạn.',
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: '5 phút đầu tiên',
		lead: 'Ba hướng dẫn nhanh có thể copy-paste. Chọn cái phù hợp với cách bạn chạy mcp-vertex.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — chạy server trực tiếp',
			intro: 'Không cần tích hợp editor: chạy host server từ terminal và trỏ bất kỳ client MCP nào tới transport stdio của nó.',
			steps: [
				'Cài đặt: `bun add @mcp-vertex/core` (hoặc `npm install @mcp-vertex/core`).',
				'Chạy: `bunx mcp-vertex --preset=standard` (hoặc `npx mcp-vertex --preset=standard`).',
				'Xác minh: tiến trình in ra danh sách plugin đã tải và chờ trên stdio — Ctrl+C để dừng.',
				'Trỏ cấu hình client MCP của bạn tới binary với `--preset=minimal|standard|swarm|full` (xem Cài đặt để có danh sách flag đầy đủ).',
				'Gọi `mcp-vertex_overview { compact: true }` trước tiên — nó cho bạn biết phải làm gì tiếp theo.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'Trình cài đặt một lệnh phát hiện VS Code và thêm mcp-vertex vào danh sách máy chủ MCP của bạn mà không đụng tới các máy chủ hiện có.',
			steps: [
				'Chạy trình cài đặt một lệnh từ trang Cài đặt (tự phát hiện IDE của bạn).',
				'Tải lại cửa sổ (`Developer: Reload Window`) để Copilot nhận ra máy chủ mới.',
				'Mở panel chat Copilot và chọn tác tử `mcp-vertex` trong bộ chọn tác tử.',
				'Yêu cầu nó gọi `mcp-vertex_overview` — nó sẽ báo cáo preset đã tải và một hành động tiếp theo được đề xuất.',
				'Nếu máy chủ không xuất hiện, xem Khắc phục sự cố → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code đọc `.mcp.json` tại gốc workspace; trình cài đặt sẽ viết hoặc hợp nhất file đó cho bạn.',
			steps: [
				'Chạy trình cài đặt một lệnh — nó phát hiện Claude Code và viết `.mcp.json`.',
				'Khởi động lại Claude Code (hoặc chạy `/mcp` để tải lại máy chủ) để nhận ra mục mới.',
				'Trong một phiên mới, các file luôn được tải `AGENTS.md` + `CLAUDE.md` đã trỏ tới `mcp-vertex_overview` như lệnh gọi đầu tiên.',
				'Xác nhận với `mcp-vertex_overview { compact: true }` — trường `recommendedNextAction` cho bạn biết phải làm gì tiếp theo.',
				'Với các phiên đa tác tử, đọc kỹ năng `proposal-swarm-runner` trước khi claim một slice.',
			],
		},
		nextSteps: 'Tiếp theo nên đi đâu',
		nextToolsCta: 'Xem tất cả công cụ',
		nextTroubleshootingCta: 'Có gì không hoạt động? Khắc phục sự cố',
	},
	troubleshooting: {
		title: 'Khắc phục sự cố',
		lead: 'Triệu chứng → nguyên nhân có thể → cách khắc phục, cho các vấn đề đã thực sự được báo cáo.',
		symptom: 'Triệu chứng',
		cause: 'Nguyên nhân có thể',
		fix: 'Cách khắc phục',
		tags: 'Thẻ',
		backToIndex: 'Quay lại khắc phục sự cố',
		closedBy: 'Đóng bởi',
		empty: 'Chưa có trường hợp khắc phục sự cố nào khớp với bộ lọc này.',
	},
	knowledge: {
		title: 'Kiến thức',
		lead: 'Các tài liệu được lập danh mục mà lõi có thể trả lời câu hỏi về chúng.',
		count: 'tài liệu',
	},
	prompts: {
		title: 'Prompt',
		lead: 'Các mẫu prompt tái sử dụng mà lõi phơi bày.',
		count: 'prompt',
		arg: 'đối số',
	},
	resources: {
		title: 'Tài nguyên',
		lead: 'Tài nguyên tĩnh đi kèm dự án (URI + MIME).',
		count: 'tài nguyên',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Kỹ năng',
		lead: 'Sổ tay miền mà tác tử có thể tải theo nhu cầu.',
		count: 'kỹ năng',
		body: 'Thân',
	},
	notFound: {
		code: '404',
		title: 'Không tìm thấy trang',
		lead: 'Trang bạn tìm không tồn tại hoặc đã được di chuyển. Lõi vẫn bất khả tri — ngay cả với các URL hỏng.',
		homeCta: 'Về trang chủ',
		toolsCta: 'Xem công cụ',
		homeAria: 'Đi đến trang chủ',
	},
	proposals: proposals,
	recovery: recovery,
	logs: logs,
	presets: {
		title: 'Preset',
		lead: 'Bộ plugin được cấu hình sẵn cho các kích thước không gian làm việc khác nhau.',
		summary: 'Kho lưu trữ này chứa {count} plugin độc nhất qua các preset.',
		hostOnlyChip: 'chỉ máy chủ',
		installTitle: 'Cách sử dụng',
		installLead: 'Chỉ định cờ --preset khi khởi động máy chủ MCP.',
		table: {
			preset: 'Preset',
		},
	},
	ui: {
		codeCopy: 'Sao chép',
		codeCopied: 'Đã sao chép!',
		codeCollapse: 'Thu gọn',
		codeExpand: 'Mở rộng',
		calloutNote: 'Ghi chú',
		calloutTip: 'Mẹo',
		calloutWarn: 'Cảnh báo',
		calloutDanger: 'Nguy hiểm',
		tabsNext: 'Tiếp',
		tabsPrev: 'Trước',
		stepsOf: 'trên',
	},
};

const extension = {
	overviewTitle: 'Tong quan mcp-vertex',
	refresh: 'mcp-vertex: Lam moi',
	runValidation: 'mcp-vertex: Chay kiem dinh',
	openProposalBoard: 'mcp-vertex: Mo bang de xuat',
	showMetrics: 'mcp-vertex: Hien thi chi so',
	toolsView: 'Cong cu mcp-vertex',
	proposalsView: 'De xuat mcp-vertex',
	statusTooltip: 'trang thai mcp-vertex',
	openDashboard: 'mcp-vertex: Mo bang dieu khien',
	openDocs: 'mcp-vertex: Mo tai lieu',
	tabOverview: 'Tong quan',
	tabMetrics: 'Chi so',
	tabTokens: 'Tokens',
	tabTools: 'Cong cu',
	tabPlugins: 'Plugin',
	tabSessions: 'Phien',
	tabTimes: 'Thoi gian',
	tabAgents: 'Tac nhan',
	tabDocs: 'Tai lieu',
	kpiTools: 'Cong cu',
	kpiPlugins: 'Plugin',
	kpiProposals: 'De xuat',
	kpiCalls: 'Cuoc goi',
	kpiTokens: 'Tokens',
	kpiSaved: 'Tiet kiem',
	kpiWall: 'Tong thoi gian',
	kpiAgents: 'Tac nhan',
	refreshDashboard: 'Lam moi bang dieu khien',
	docsUrlRejected: 'mcp-vertex: URL tai lieu bi tu choi',
	openKnowledge: 'mcp-vertex: Mo bo duyet tri thuc',
	toolSearch: 'mcp-vertex: Tim cong cu',
	restartServer: 'mcp-vertex: Khoi dong lai may chu MCP',
	openSettings: 'mcp-vertex: Mo cai dat',
	memorySave: 'mcp-vertex: Luu ghi chu bo nho',
	memoryForget: 'mcp-vertex: Quen ghi chu bo nho',
	tabHealth: 'Suc khoe',
	healthHealthy: 'Khoe manh',
	healthDegraded: 'Suy giam',
	healthLocks: 'Khoa',
	healthStale: 'Tac nhan khong hoat dong',
	healthQueue: 'Hang doi',
	serverRestartHint:
		'mcp-vertex: vui long khoi dong lai tien ich de khoi dong lai may chu MCP.',
	openLogsToday: "mcp-vertex: Open Today's Log", // TODO(i18n): translate to this locale
	gitStatus: 'mcp-vertex: Git Status', // TODO(i18n): translate to this locale
	openMemory: 'mcp-vertex: Open Memory Search', // TODO(i18n): translate to this locale
	notificationTest: 'mcp-vertex: Test Notification', // TODO(i18n): translate to this locale
	depsCheck: 'mcp-vertex: Check Dependencies', // TODO(i18n): translate to this locale
	webFetch: 'mcp-vertex: Web Fetch', // TODO(i18n): translate to this locale
	toolbarCategoryProposals: 'Proposals', // TODO(i18n): translate to this locale
	toolbarCategoryKnowledge: 'Knowledge', // TODO(i18n): translate to this locale
	toolbarCategoryLogs: 'Logs', // TODO(i18n): translate to this locale
	toolbarCategoryDocs: 'Docs', // TODO(i18n): translate to this locale
	toolbarCategoryQuality: 'Quality', // TODO(i18n): translate to this locale
	toolbarCategoryGit: 'Git', // TODO(i18n): translate to this locale
	toolbarCategoryMemory: 'Memory', // TODO(i18n): translate to this locale
	toolbarCategoryNotification: 'Notifications', // TODO(i18n): translate to this locale
	toolbarCategoryDeps: 'Dependencies', // TODO(i18n): translate to this locale
	toolbarCategoryTools: 'Tools', // TODO(i18n): translate to this locale
	setupGithub: 'mcp-vertex: Thiết lập issues GitHub',
};

const dict: ILangDict = {
	site: site as unknown as ILangDict['site'],
	extension: extension as unknown as ILangDict['extension'],
	tools: {},
};

export default dict;
