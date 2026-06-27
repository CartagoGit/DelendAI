import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Khái niệm',
		install: 'Cài đặt',
		setup: 'Thiết lập',
		capabilities: 'Khả năng',
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
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
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
				'Với các phiên đa tác tử, đọc kỹ năng `mcp-vertex-proposal-swarm-runner` trước khi claim một slice.',
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
	proposals: proposalGlossaryByLang.vi,
	recovery: recoveryByLang.vi,
	logs: logsByLang.vi,
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
	setup: {
		title: 'Thiết lập đa dự án',
		lead: 'Kết nối mcp-vertex vào bất kỳ kho lưu trữ nào và chuẩn bị plugin issues của GitHub cho kho đó — đúng 7 bước mà lệnh setup-github thực hiện.',
		stepsTitle: '7 bước',
		docsLinkLabel: 'Đọc hướng dẫn thiết lập đa dự án chính thức',
		detectRepoTitle: 'Phát hiện kho',
		detectRepoBody:
			'Đọc remote GitHub và chuẩn hóa thành owner/name. Slug được phát hiện phải trỏ tới kho bạn mong đợi.',
		confirmRepoTitle: 'Xác nhận owner/name',
		confirmRepoBody:
			'Chạy lệnh thiết lập và xác nhận (hoặc ghi đè) slug được phát hiện trước khi ghi bất cứ thứ gì.',
		pickAuthTierTitle: 'Chọn cấp xác thực',
		pickAuthTierBody:
			'Dùng gh khi gh auth status thành công, rest-authed khi GITHUB_TOKEN được đặt, ngược lại dùng rest-anon (giới hạn 60 yêu cầu/giờ).',
		writeConfigTitle: 'Ghi cấu hình',
		writeConfigBody:
			'Ghi plugins.issues.options.repo vào mcp-vertex.config.json mà không động đến các thiết lập plugin khác.',
		verifyTierTitle: 'Xác minh cấp',
		verifyTierBody:
			'Khởi chạy host với plugin issues đã nạp để kiểm tra đầu cuối cấp xác thực đã chọn.',
		printInvocationTitle: 'In lệnh khởi chạy',
		printInvocationBody:
			'Thêm khối server này vào mcp.json của bạn. Cấu trúc giống nhau trên VS Code, Cursor và Claude Code.',
		markConfiguredTitle: 'Đánh dấu đã cấu hình',
		markConfiguredBody:
			'Tùy chọn ghi lại rằng kho này đã được cấu hình một lần, để các lần chạy sau bỏ qua các bước hỏi.',
		optionalLabel: 'tùy chọn',
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

	homeQuickInstall: {
		title: 'Cài nhanh',
		lead: 'Chọn trình quản lý gói của bạn. Cùng một lệnh chạy với Node, Deno và Bun — phần còn lại nằm ở trang cài đặt.',
		tabsLabel: 'Trình quản lý gói',
		pms: [
			{ id: 'npm', note: 'Node Package Manager — đi kèm Node.js.' },
			{
				id: 'pnpm',
				note: 'Nhanh, tiết kiệm đĩa, phân giải phụ thuộc chặt.',
			},
			{ id: 'yarn', note: 'Lựa chọn cổ điển thay cho npm.' },
			{
				id: 'bun',
				note: 'Runtime + trình quản lý gói tất cả trong một — chính mcp-vertex được dựng bằng bun.',
			},
			{
				id: 'deno',
				note: 'Runtime an toàn theo mặc định với TypeScript hạng nhất.',
			},
		],
		recommended: 'Được khuyến nghị',
		fullCta: 'Ma trận cài đặt đầy đủ',
	},
	homeAtAGlance: {
		title: 'Nó có thể làm gì?',
		lead: 'Chọn một mục. Trang chủ chỉ định hướng — mỗi điểm truy cập có một trang riêng với đầy đủ chi tiết.',
		tabsLabel: 'Mục',
		openSection: 'Mở',
		panels: [
			{
				id: 'plugins',
				label: 'Plugin',
				summary:
					'Các gói đã phát hành. Chỉ tải những gì bạn cần; lõi vẫn nhỏ gọn.',
				href: 'plugins',
				icon: '/logos/plugin-proposals.svg',
			},
			{
				id: 'tools',
				label: 'Công cụ',
				summary:
					'Mọi công cụ của bộ plugin đầy đủ, nhóm theo namespace — từ registry sống.',
				href: 'tools',
				icon: '/logos/plugin-core.svg',
			},
			{
				id: 'bench',
				label: 'Đo lường',
				summary:
					'Hiệu quả token là một bất biến được bảo vệ — được đo, không tuyên bố.',
				href: 'benchmarks',
				icon: '/logos/plugin-quality.svg',
			},
			{
				id: 'skills',
				label: 'Kỹ năng',
				summary: 'Cẩm nang miền mà tác tử có thể tải theo yêu cầu.',
				href: 'skills',
				icon: '/logos/plugin-docs.svg',
			},
			{
				id: 'knowledge',
				label: 'Tri thức',
				summary: 'Tài liệu đã lập chỉ mục mà lõi có thể trả lời.',
				href: 'knowledge',
				icon: '/logos/plugin-memory.svg',
			},
			{
				id: 'presets',
				label: 'Preset',
				summary: 'Bộ plugin cấu hình sẵn cho mọi kích thước workspace.',
				href: 'presets',
				icon: '/logos/plugin-search.svg',
			},
			{
				id: 'setup',
				label: 'Thiết lập đa dự án',
				summary:
					'Cắm mcp-vertex vào bất kỳ repo nào và chuẩn bị plugin issues.',
				href: 'setup',
				icon: '/logos/github.png',
			},
		],
	},
};

export default dict;
