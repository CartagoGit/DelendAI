/** Origin presentation shared by the plugin catalog and detail surfaces. */
import type { Lang } from '#I18N/index';
import { PLUGIN_CATALOG } from '#DATA/plugin-catalog';

const copy: Readonly<
	Record<
		Lang,
		{
			intro: string;
			bundled: { label: string; description: string };
			'user-local': { label: string; description: string };
			external: { label: string; description: string };
		}
	>
> = {
	en: {
		intro: 'Know exactly who owns every capability before you enable it.',
		bundled: {
			label: 'Ours · bundled',
			description:
				'First-party @mcp-vertex plugins maintained and published with the project.',
		},
		'user-local': {
			label: 'Yours · local',
			description:
				'Project-specific plugins loaded from your workspace through a config path.',
		},
		external: {
			label: 'External',
			description:
				'Third-party MCP servers composed behind the external-mcps proxy.',
		},
	},
	es: {
		intro: 'Conoce quién mantiene cada capacidad antes de activarla.',
		bundled: {
			label: 'Nuestros · incluidos',
			description:
				'Plugins oficiales @mcp-vertex mantenidos y publicados con el proyecto.',
		},
		'user-local': {
			label: 'Tuyos · locales',
			description:
				'Plugins específicos de tu proyecto cargados desde una ruta del workspace.',
		},
		external: {
			label: 'Externos',
			description:
				'Servidores MCP de terceros compuestos tras el proxy external-mcps.',
		},
	},
	fr: {
		intro: 'Identifiez le propriétaire de chaque capacité avant de l’activer.',
		bundled: {
			label: 'Nôtres · inclus',
			description:
				'Plugins officiels @mcp-vertex maintenus et publiés avec le projet.',
		},
		'user-local': {
			label: 'Vôtres · locaux',
			description:
				'Plugins propres à votre projet chargés depuis un chemin du workspace.',
		},
		external: {
			label: 'Externes',
			description:
				'Serveurs MCP tiers composés derrière le proxy external-mcps.',
		},
	},
	de: {
		intro: 'Erkennen Sie vor der Aktivierung, wer jede Funktion verantwortet.',
		bundled: {
			label: 'Unsere · gebündelt',
			description:
				'Offizielle @mcp-vertex-Plugins, die mit dem Projekt gepflegt werden.',
		},
		'user-local': {
			label: 'Ihre · lokal',
			description: 'Projektspezifische Plugins aus einem Workspace-Pfad.',
		},
		external: {
			label: 'Extern',
			description:
				'MCP-Server von Drittanbietern hinter dem external-mcps-Proxy.',
		},
	},
	it: {
		intro: 'Scopri chi gestisce ogni capacità prima di attivarla.',
		bundled: {
			label: 'Nostri · inclusi',
			description:
				'Plugin ufficiali @mcp-vertex mantenuti e pubblicati con il progetto.',
		},
		'user-local': {
			label: 'Tuoi · locali',
			description:
				'Plugin specifici del progetto caricati da un percorso del workspace.',
		},
		external: {
			label: 'Esterni',
			description:
				'Server MCP di terze parti dietro il proxy external-mcps.',
		},
	},
	pt: {
		intro: 'Saiba quem mantém cada capacidade antes de a ativar.',
		bundled: {
			label: 'Nossos · incluídos',
			description:
				'Plugins oficiais @mcp-vertex mantidos e publicados com o projeto.',
		},
		'user-local': {
			label: 'Seus · locais',
			description:
				'Plugins específicos do projeto carregados de um caminho do workspace.',
		},
		external: {
			label: 'Externos',
			description:
				'Servidores MCP de terceiros atrás do proxy external-mcps.',
		},
	},
	ja: {
		intro: '有効化する前に各機能の提供元を確認できます。',
		bundled: {
			label: '公式・同梱',
			description:
				'プロジェクトと共に保守・公開される公式 @mcp-vertex プラグイン。',
		},
		'user-local': {
			label: 'ユーザー・ローカル',
			description:
				'ワークスペースのパスから読み込むプロジェクト固有プラグイン。',
		},
		external: {
			label: '外部',
			description:
				'external-mcps プロキシ経由で構成する第三者 MCP サーバー。',
		},
	},
	zh: {
		intro: '启用前即可确认每项能力的维护方。',
		bundled: {
			label: '官方·内置',
			description: '随项目维护和发布的官方 @mcp-vertex 插件。',
		},
		'user-local': {
			label: '你的·本地',
			description: '通过工作区路径加载的项目专用插件。',
		},
		external: {
			label: '外部',
			description: '通过 external-mcps 代理组合的第三方 MCP 服务器。',
		},
	},
	hi: {
		intro: 'सक्रिय करने से पहले हर क्षमता के स्वामी को जानें।',
		bundled: {
			label: 'हमारे · शामिल',
			description:
				'परियोजना के साथ रखे और प्रकाशित आधिकारिक @mcp-vertex प्लगइन।',
		},
		'user-local': {
			label: 'आपके · स्थानीय',
			description: 'वर्कस्पेस पथ से लोड परियोजना-विशिष्ट प्लगइन।',
		},
		external: {
			label: 'बाहरी',
			description: 'external-mcps प्रॉक्सी के पीछे तृतीय-पक्ष MCP सर्वर।',
		},
	},
	ar: {
		intro: 'اعرف الجهة المسؤولة عن كل قدرة قبل تفعيلها.',
		bundled: {
			label: 'خاصتنا · مضمّنة',
			description:
				'إضافات @mcp-vertex الرسمية التي تُصان وتُنشر مع المشروع.',
		},
		'user-local': {
			label: 'خاصتك · محلية',
			description: 'إضافات خاصة بالمشروع تُحمّل من مسار مساحة العمل.',
		},
		external: {
			label: 'خارجية',
			description: 'خوادم MCP لطرف ثالث خلف وكيل external-mcps.',
		},
	},
	th: {
		intro: 'ทราบผู้ดูแลแต่ละความสามารถก่อนเปิดใช้งาน',
		bundled: {
			label: 'ของเรา · รวมมาให้',
			description: 'ปลั๊กอิน @mcp-vertex ทางการที่ดูแลและเผยแพร่พร้อมโครงการ',
		},
		'user-local': {
			label: 'ของคุณ · ภายใน',
			description: 'ปลั๊กอินเฉพาะโครงการที่โหลดจากพาธในเวิร์กสเปซ',
		},
		external: {
			label: 'ภายนอก',
			description: 'เซิร์ฟเวอร์ MCP บุคคลที่สามหลังพร็อกซี external-mcps',
		},
	},
	vi: {
		intro: 'Biết rõ đơn vị sở hữu từng khả năng trước khi bật.',
		bundled: {
			label: 'Của chúng tôi · đi kèm',
			description:
				'Plugin @mcp-vertex chính thức được duy trì và phát hành cùng dự án.',
		},
		'user-local': {
			label: 'Của bạn · cục bộ',
			description:
				'Plugin riêng của dự án được tải từ đường dẫn workspace.',
		},
		external: {
			label: 'Bên ngoài',
			description: 'Máy chủ MCP bên thứ ba phía sau proxy external-mcps.',
		},
	},
};

export const pluginOriginForCatalogSlug = (slug: string) =>
	PLUGIN_CATALOG[slug] === undefined ? undefined : ('bundled' as const);

export const pluginOriginCopyFor = (lang: Lang) => copy[lang];
