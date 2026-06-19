import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: '概念',
		install: '安装',
		tools: '工具',
		benchmarks: '基准',
		plugins: '插件',
		github: 'GitHub',
		resources: '资源',
		skills: '技能',
		guide: '指南',
	},
	hero: {
		title: { a: '与项目无关的 ', b: 'MCP Vertex', c: '' },
		subheader: '适用于任何项目的 MCP 服务器内核 + 插件加载器。',
		tagline:
			'一个与项目无关的 Model Context Protocol 服务器内核。内核对你的领域一无所知——能力以插件形式按需加载，并且都以低 token 成本为目标进行度量。',
		ctaInstall: '开始使用',
		ctaTools: '浏览工具',
		runsOn: '可在 Node、Deno 和 bun 下运行 · 任意包管理器',
	},
	marquee: { runtimes: '构建与运行环境', clients: 'MCP 客户端与模型' },
	concept: {
		title: '一个小内核，许多插件',
		body: 'mcp-vertex 是密封的内核：确定性的工具注册、注入的工作区路径、CLI 插件加载器，以及以 token 度量的工具表面。所有领域相关的东西都是插件——只加载你需要的，适用于任何宿主或模型。',
		f1: {
			t: '与项目无关',
			b: '内核中没有领域代码。同一个插件在任何宿主或模型下表现一致。',
		},
		f2: {
			t: '低 token 设计',
			b: '单一 overview、惰性知识与紧凑 JSON。受度量的预算在 CI 中防止回退。',
		},
		f3: {
			t: '安全并发',
			b: '原子写入、带所有权令牌的跨进程互斥锁，以及损坏隔离。',
		},
		f4: {
			t: '面向多智能体',
			b: 'proposals 插件协调一个 swarm：锁、任务队列、切片不相交与推送通知。',
		},
	},
	install: {
		title: '安装与运行',
		lead: '添加它，并让你的 MCP 客户端指向 mcp-vertex 可执行文件：',
		verify: '验证可运行',
		addto: '添加到你的 IDE / 智能体',
		presets: '预设：',
		oneCmd: '一条命令 · 任意 IDE',
		oneCmdNote:
			'自动检测你的 IDE 并加入 mcp-vertex——绝不动你其它的 MCP 服务器。',
		config: '选择一个预设（minimal · standard · swarm）或显式列出插件。用 --check 自检。',
		excludeHelp:
			'使用 --exclude-plugins=（别名 --excludePlugins=）从解析结果中移除插件。便于在不复刻的情况下从预设中去掉某个插件——例如 --preset=swarm --exclude-plugins=notification 用于单智能体会话。',
	},
	tools: {
		title: '工具',
		lead: '完整插件集暴露的每个工具，按命名空间分组——取自实时注册表，因此本页永不与代码脱节。',
		count: '个工具',
		packages: '个包',
	},
	bench: {
		title: '度量，而非声称',
		lead: 'token 效率是受保护的不变量——若这些上限回退，CI 测试会失败。',
		b1: {
			t: '冷启动',
			b: 'overview（紧凑）+ auto_work —— 完整定位低于 300 token。',
		},
		b2: {
			t: '无轮询',
			b: '锁释放为推送（notification 插件），而非循环轮询。',
		},
		b3: {
			t: '防漂移',
			b: '生成的类型 SDK、token 预算，以及覆盖真实协议的严格 e2e 网。',
		},
		live: {
			title: '定位成本 · 实时测量',
			note: '智能体看到的结果文本的 token 数（≈4 字节/token），用 proposals+memory 在协议上实时测量。基线是手动定位的示意性估算——并非某个第三方工具的实测。',
		},
		baseline: '不用 mcp-vertex（手动 · 估算）',
	},
	plugins: {
		title: '插件',
		lead: '已发布的包。只加载你需要的；内核保持极小。',
	},
	cfg: {
		title: '设置',
		theme: '主题',
		language: '语言',
		motion: '动画',
		motionLabel: '为跑马灯启用动画',
	},
	footer: {
		built: '取自实时工具注册表生成。',
		tagline: '项目无关的 MCP 服务器核心 + 插件加载器。',
		sections: '章节',
		resources: '资源',
		madeBy: '由 Cartago 制作 · @CartagoGit 在 GitHub',
		creatorsRepo: '作者 GitHub',
		creatorsNpm: '作者 npm',
	},
	pluginpage: { back: '返回', tools: '工具', install: '安装' },
	plugin: {
		proposals:
			'多智能体协调：锁、任务队列、切片、round-context、状态修复。',
		git: '只读仓库检视：status、变更文件、diff、log。',
		memory: '跨会话持久笔记，含 BM25 召回、配额、TTL 与密钥脱敏。',
		search: '低成本工作区搜索：子串或正则，glob 包含/排除。',
		rules: '框架检测 + lint/约定建议；项目配置优先。',
		quality: '运行质量门（lint/test/build），带允许/拒绝命令策略；可取消。',
		docs: '编目并阅读项目 markdown 文档，低成本的精选导航。',
		deps: '离线依赖清单 + 健康检查（lockfile、宽松范围、重复）。',
		notification: '推送锁释放事件，让智能体停止轮询。',
		'status-marker':
			'每个智能体回复必须以彩色结束标记收尾：8 个标准状态、辅助与校验工具。',
		core: '与项目无关的内核：overview、scaffold、指标、doctor 和插件加载器。',
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
		title: '页面未找到',
		lead: '你查找的页面不存在或已被移动。内核保持与项目无关——甚至对损坏的 URL 也一样。',
		homeCta: '返回首页',
		toolsCta: '浏览工具',
		homeAria: '前往首页',
	},
};

export default dict;
