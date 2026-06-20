import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Khái niệm',
		install: 'Cài đặt',
		tools: 'Công cụ',
		benchmarks: 'Benchmark',
		plugins: 'Plugin',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Kiến thức',
		prompts: 'Prompt',
		resources: 'Tài nguyên',
		skills: 'Kỹ năng',
		guide: 'Hướng dẫn',
		more: 'Thêm',
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
		config: 'Chọn một preset (minimal · standard · swarm) hoặc liệt kê plugin tường minh. Chạy với --check để tự chẩn đoán.',
		excludeHelp:
			'Trừ plugin khỏi tập đã giải bằng --exclude-plugins= (bí danh: --excludePlugins=). Hữu ích để loại một plugin khỏi preset mà không fork — ví dụ --preset=swarm --exclude-plugins=notification cho phiên đơn tác tử.',
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
		'status-marker':
			'Đánh dấu kết thúc màu bắt buộc cho mỗi phản hồi của tác tử: 8 trạng thái chuẩn, công cụ helper + validator.',
		core: 'Lõi bất khả tri: overview, scaffold, số liệu, doctor và trình tải plugin.',
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
};

export default dict;
