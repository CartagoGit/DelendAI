/**
 * nav-refresh.ts — runtime i18n refresh for the persist-mounted chrome
 * (x126 S2).
 *
 * The nav and the footer are `transition:persist`-ed in `Base.astro`,
 * so Astro replaces the inner HTML on `astro:after-swap` rather than
 * re-mounting the whole `<SiteNav>` / `<SiteFooter>` components. In some
 * edge cases the new DOM's `textContent` is stale (the `<html lang>`
 * attribute is the only piece of state Astro updates synchronously, and
 * the persisted chrome's textContent can race the swap). Belt-and-braces
 * fix: a small script that runs on every `astro:after-swap` and replaces
 * the `textContent` of every `[data-nav-key]` and `[data-footer-key]`
 * element with the value in this map for the active locale.
 *
 * The canonical source of truth for these strings is the per-locale
 * dictionaries under `apps/web/src/i18n/langs/<code>.ts`. This map is a
 * runtime safety net for the chrome only (9 nav keys × 12 locales +
 * 6 footer keys × 12 locales). The `check-i18n` script will surface
 * any drift in CI if these values diverge from the lang files.
 */
import type { Lang } from '#I18N/shared';

type NavKey =
	| 'home'
	| 'install'
	| 'tools'
	| 'benchmarks'
	| 'plugins'
	| 'prompts'
	| 'resources'
	| 'knowledge'
	| 'guide'
	| 'api'
	| 'more';

type FooterKey =
	| 'tagline'
	| 'madeBy'
	| 'sections'
	| 'resources'
	| 'creatorsRepo'
	| 'creatorsNpm'
	| 'built';

const NAV: Readonly<Record<Lang, Readonly<Record<NavKey, string>>>> = {
	en: {
		home: 'Home',
		install: 'Install',
		tools: 'Tools',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		prompts: 'Prompts',
		resources: 'Resources',
		knowledge: 'Knowledge',
		guide: 'Guide',
		api: 'API',
		more: 'More',
	},
	es: {
		home: 'Inicio',
		install: 'Instalar',
		tools: 'Herramientas',
		benchmarks: 'Comparativas',
		plugins: 'Plugins',
		prompts: 'Prompts',
		resources: 'Recursos',
		knowledge: 'Conocimiento',
		guide: 'Guía',
		api: 'API',
		more: 'Más',
	},
	fr: {
		home: 'Accueil',
		install: 'Installer',
		tools: 'Outils',
		benchmarks: 'Benchmarks',
		plugins: 'Extensions',
		prompts: 'Prompts',
		resources: 'Ressources',
		knowledge: 'Connaissances',
		guide: 'Guide',
		api: 'API',
		more: 'Plus',
	},
	de: {
		home: 'Start',
		install: 'Installieren',
		tools: 'Werkzeuge',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		prompts: 'Prompts',
		resources: 'Ressourcen',
		knowledge: 'Wissen',
		guide: 'Leitfaden',
		api: 'API',
		more: 'Mehr',
	},
	pt: {
		home: 'Início',
		install: 'Instalar',
		tools: 'Ferramentas',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		prompts: 'Prompts',
		resources: 'Recursos',
		knowledge: 'Conhecimento',
		guide: 'Guia',
		api: 'API',
		more: 'Mais',
	},
	it: {
		home: 'Home',
		install: 'Installa',
		tools: 'Strumenti',
		benchmarks: 'Confronti',
		plugins: 'Plugin',
		prompts: 'Prompt',
		resources: 'Risorse',
		knowledge: 'Conoscenza',
		guide: 'Guida',
		api: 'API',
		more: 'Altro',
	},
	zh: {
		home: '首页',
		install: '安装',
		tools: '工具',
		benchmarks: '基准',
		plugins: '插件',
		prompts: '提示',
		resources: '资源',
		knowledge: '知识',
		guide: '指南',
		api: 'API',
		more: '更多',
	},
	hi: {
		home: 'मुखपृष्ठ',
		install: 'इंस्टॉल',
		tools: 'टूल',
		benchmarks: 'बेंचमार्क',
		plugins: 'प्लगइन',
		prompts: 'प्रॉम्प्ट',
		resources: 'संसाधन',
		knowledge: 'ज्ञान',
		guide: 'गाइड',
		api: 'API',
		more: 'और',
	},
	ar: {
		home: 'الرئيسية',
		install: 'التثبيت',
		tools: 'الأدوات',
		benchmarks: 'القياسات',
		plugins: 'الإضافات',
		prompts: 'المطالبات',
		resources: 'الموارد',
		knowledge: 'المعرفة',
		guide: 'الدليل',
		api: 'API',
		more: 'المزيد',
	},
	ja: {
		home: 'ホーム',
		install: 'インストール',
		tools: 'ツール',
		benchmarks: 'ベンチマーク',
		plugins: 'プラグイン',
		prompts: 'プロンプト',
		resources: 'リソース',
		knowledge: 'ナレッジ',
		guide: 'ガイド',
		api: 'API',
		more: 'その他',
	},
	vi: {
		home: 'Trang chủ',
		install: 'Cài đặt',
		tools: 'Công cụ',
		benchmarks: 'Đo điểm chuẩn',
		plugins: 'Plugin',
		prompts: 'Lời nhắc',
		resources: 'Tài nguyên',
		knowledge: 'Kiến thức',
		guide: 'Hướng dẫn',
		api: 'API',
		more: 'Thêm',
	},
	th: {
		home: 'หน้าแรก',
		install: 'ติดตั้ง',
		tools: 'เครื่องมือ',
		benchmarks: 'เกณฑ์มาตรฐาน',
		plugins: 'ปลั๊กอิน',
		prompts: 'พรอมต์',
		resources: 'ทรัพยากร',
		knowledge: 'ความรู้',
		guide: 'คู่มือ',
		api: 'API',
		more: 'เพิ่มเติม',
	},
};

const FOOTER: Readonly<Record<Lang, Readonly<Record<FooterKey, string>>>> = {
	en: {
		tagline: 'A project-agnostic MCP server core + plugin loader.',
		madeBy: 'Made by Cartago · @CartagoGit on GitHub',
		sections: 'Sections',
		resources: 'Resources',
		creatorsRepo: 'Creator on GitHub',
		creatorsNpm: 'Creator on npm',
		built: 'Generated from the live tool registry.',
	},
	es: {
		tagline:
			'Un núcleo de servidor MCP agnóstico al proyecto + cargador de plugins.',
		madeBy: 'Hecho por Cartago · @CartagoGit en GitHub',
		sections: 'Secciones',
		resources: 'Recursos',
		creatorsRepo: 'Creador en GitHub',
		creatorsNpm: 'Creador en npm',
		built: 'Generado a partir del registro vivo de herramientas.',
	},
	fr: {
		tagline:
			'Un cœur de serveur MCP agnostique au projet + chargeur de plugins.',
		madeBy: 'Réalisé par Cartago · @CartagoGit sur GitHub',
		sections: 'Sections',
		resources: 'Ressources',
		creatorsRepo: 'Créateur sur GitHub',
		creatorsNpm: 'Créateur sur npm',
		built: 'Généré à partir du registre d\u2019outils en direct.',
	},
	de: {
		tagline: 'Ein projektunabhängiger MCP-Server-Kern + Plugin-Lader.',
		madeBy: 'Erstellt von Cartago · @CartagoGit auf GitHub',
		sections: 'Bereiche',
		resources: 'Ressourcen',
		creatorsRepo: 'Ersteller auf GitHub',
		creatorsNpm: 'Ersteller auf npm',
		built: 'Aus der Live-Tool-Registry generiert.',
	},
	pt: {
		tagline:
			'Um núcleo de servidor MCP independente do projeto + carregador de plugins.',
		madeBy: 'Feito por Cartago · @CartagoGit no GitHub',
		sections: 'Secções',
		resources: 'Recursos',
		creatorsRepo: 'Criador no GitHub',
		creatorsNpm: 'Criador no npm',
		built: 'Gerado a partir do registro de ferramentas ao vivo.',
	},
	it: {
		tagline:
			'Un nucleo server MCP agnostico al progetto + caricatore di plugin.',
		madeBy: 'Realizzato da Cartago · @CartagoGit su GitHub',
		sections: 'Sezioni',
		resources: 'Risorse',
		creatorsRepo: 'Autore su GitHub',
		creatorsNpm: 'Autore su npm',
		built: 'Generato dal registro live degli strumenti.',
	},
	zh: {
		tagline: '一个与项目无关的 MCP 服务器核心 + 插件加载器。',
		madeBy: '由 Cartago 制作 · @CartagoGit 在 GitHub',
		sections: '章节',
		resources: '资源',
		creatorsRepo: 'GitHub 上的创建者',
		creatorsNpm: 'npm 上的创建者',
		built: '从实时工具注册表生成。',
	},
	hi: {
		tagline: 'एक प्रोजेक्ट-अज्ञेय MCP सर्वर कोर + प्लगइन लोडर।',
		madeBy: 'Cartago द्वारा बनाया गया · @CartagoGit GitHub पर',
		sections: 'अनुभाग',
		resources: 'संसाधन',
		creatorsRepo: 'GitHub पर निर्माता',
		creatorsNpm: 'npm पर निर्माता',
		built: 'लाइव टूल रजिस्ट्री से उत्पन्न।',
	},
	ar: {
		tagline: 'نواة خادم MCP غير مرتبطة بمشروع + محمّل إضافات.',
		madeBy: 'من صنع Cartago · @CartagoGit على GitHub',
		sections: 'الأقسام',
		resources: 'الموارد',
		creatorsRepo: 'المطور على GitHub',
		creatorsNpm: 'المطور على npm',
		built: 'تم إنشاؤه من سجل الأدوات المباشر.',
	},
	ja: {
		tagline:
			'プロジェクトに依存しない MCP サーバーコア + プラグインローダー。',
		madeBy: 'Cartago による · @CartagoGit on GitHub',
		sections: 'セクション',
		resources: 'リソース',
		creatorsRepo: 'GitHub の作者',
		creatorsNpm: 'npm の作者',
		built: 'ライブツールレジストリから生成。',
	},
	vi: {
		tagline: 'Một lõi máy chủ MCP độc lập với dự án + trình tải plugin.',
		madeBy: 'Tạo bởi Cartago · @CartagoGit trên GitHub',
		sections: 'Mục',
		resources: 'Tài nguyên',
		creatorsRepo: 'Tác giả trên GitHub',
		creatorsNpm: 'Tác giả trên npm',
		built: 'Được tạo từ sổ đăng ký công cụ trực tiếp.',
	},
	th: {
		tagline: 'แกนเซิร์ฟเวอร์ MCP ที่ไม่ขึ้นกับโปรเจ็กต์ + ตัวโหลดปลั๊กอิน',
		madeBy: 'สร้างโดย Cartago · @CartagoGit บน GitHub',
		sections: 'ส่วน',
		resources: 'ทรัพยากร',
		creatorsRepo: 'ผู้สร้างบน GitHub',
		creatorsNpm: 'ผู้สร้างบน npm',
		built: 'สร้างจากรีจิสทรีเครื่องมือสด',
	},
};

const LANG_FALLBACK: Lang = 'en';

const isLang = (s: string): s is Lang =>
	[
		'en',
		'es',
		'fr',
		'de',
		'pt',
		'it',
		'zh',
		'hi',
		'ar',
		'ja',
		'vi',
		'th',
	].includes(s);

export const resolveLang = (raw: string | null | undefined): Lang =>
	raw && isLang(raw) ? raw : LANG_FALLBACK;

/**
 * Walk the live DOM and replace the textContent of every
 * `[data-nav-key]` and `[data-footer-key]` element with the
 * value in the map for `lang`. Returns the number of elements
 * touched (handy for smoke tests).
 */
export const refreshChrome = (lang: string): number => {
	const navTable = NAV[resolveLang(lang)] ?? NAV[LANG_FALLBACK];
	const footerTable = FOOTER[resolveLang(lang)] ?? FOOTER[LANG_FALLBACK];
	let touched = 0;
	for (const el of document.querySelectorAll<HTMLElement>('[data-nav-key]')) {
		const key = el.dataset.navKey as NavKey | undefined;
		if (!key) continue;
		const value = navTable[key];
		if (typeof value === 'string' && el.textContent !== value) {
			el.textContent = value;
			touched += 1;
		}
	}
	for (const el of document.querySelectorAll<HTMLElement>(
		'[data-footer-key]',
	)) {
		const key = el.dataset.footerKey as FooterKey | undefined;
		if (!key) continue;
		const value = footerTable[key];
		if (typeof value === 'string' && el.textContent !== value) {
			el.textContent = value;
			touched += 1;
		}
	}
	return touched;
};
