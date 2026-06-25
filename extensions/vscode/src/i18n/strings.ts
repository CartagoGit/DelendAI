/**
 * strings.ts — setup-github webview copy, 12 languages (f00030 S4).
 *
 * The VS Code `mcp-vertex.setupGithub` webview mirrors the web wizard
 * (`apps/web/src/pages/setup.astro`) and the canonical 7-step guide in
 * `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`. The command *title* lives in the shared
 * dictionary (`@mcp-vertex/shared/i18n` → `extension.setupGithub`) so it
 * passes the extension i18n gate; the multi-step webview body is here, in
 * one self-contained typed table, so the wizard copy stays cohesive and
 * testable without inflating the shared flat-key surface.
 *
 * Every visible string has all 12 language entries (f00030 §5.4). The
 * `assertSetupGithubStringsComplete` helper is exercised by the spec so a
 * missing language fails the test gate, mirroring `check-i18n.ts`.
 */
import type { Lang } from './index';

/** One step's user-facing copy (title + body). */
export interface ISetupGithubStepStrings {
	readonly title: string;
	readonly body: string;
}

/** All copy the webview needs for one language. */
export interface ISetupGithubStrings {
	/** Webview panel + heading title. */
	readonly title: string;
	/** One-line intro shown above the steps. */
	readonly intro: string;
	/** Label for the link back to the canonical docs guide. */
	readonly docsLink: string;
	/** Navigation + action button labels. */
	readonly next: string;
	readonly back: string;
	readonly copy: string;
	readonly copied: string;
	readonly finish: string;
	/** "Step {n} of {total}" template — uses `{n}` / `{total}` tokens. */
	readonly stepLabel: string;
	readonly optional: string;
	/** The 7 canonical steps, in guide order. */
	readonly steps: readonly [
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
		ISetupGithubStepStrings,
	];
}

const en: ISetupGithubStrings = {
	title: 'Cross-project setup',
	intro: 'Wire mcp-vertex into this repository and get the GitHub issues plugin ready — the same 7 steps the setup-github command runs.',
	docsLink: 'Read the canonical cross-project setup guide',
	next: 'Next',
	back: 'Back',
	copy: 'Copy command',
	copied: 'Copied!',
	finish: 'Finish',
	stepLabel: 'Step {n} of {total}',
	optional: 'optional',
	steps: [
		{
			title: 'Detect repo',
			body: 'Read the GitHub remote and normalize it to owner/name.',
		},
		{
			title: 'Confirm owner/name',
			body: 'Run the setup command and confirm the detected repo slug.',
		},
		{
			title: 'Pick auth tier',
			body: 'gh when gh auth status succeeds, rest-authed with GITHUB_TOKEN, else rest-anon (60 req/h).',
		},
		{
			title: 'Write config',
			body: 'Write plugins.issues.options.repo into mcp-vertex.config.json.',
		},
		{
			title: 'Verify tier',
			body: 'Launch the host with the issues plugin loaded to exercise the tier.',
		},
		{
			title: 'Print invocation',
			body: 'Add this server block to your host mcp.json.',
		},
		{
			title: 'Mark configured',
			body: 'Optionally record that this repo was configured once.',
		},
	],
};

const es: ISetupGithubStrings = {
	title: 'Configuración entre proyectos',
	intro: 'Integra mcp-vertex en este repositorio y deja listo el plugin de issues de GitHub: los mismos 7 pasos que ejecuta el comando setup-github.',
	docsLink: 'Lee la guía canónica de configuración entre proyectos',
	next: 'Siguiente',
	back: 'Atrás',
	copy: 'Copiar comando',
	copied: '¡Copiado!',
	finish: 'Finalizar',
	stepLabel: 'Paso {n} de {total}',
	optional: 'opcional',
	steps: [
		{
			title: 'Detectar el repo',
			body: 'Lee el remoto de GitHub y normalízalo a owner/name.',
		},
		{
			title: 'Confirmar owner/name',
			body: 'Ejecuta el comando de configuración y confirma el slug detectado.',
		},
		{
			title: 'Elegir nivel de autenticación',
			body: 'gh cuando gh auth status funciona, rest-authed con GITHUB_TOKEN, o rest-anon (60 req/h).',
		},
		{
			title: 'Escribir la configuración',
			body: 'Escribe plugins.issues.options.repo en mcp-vertex.config.json.',
		},
		{
			title: 'Verificar el nivel',
			body: 'Inicia el host con el plugin de issues cargado para ejercitar el nivel.',
		},
		{
			title: 'Imprimir la invocación',
			body: 'Añade este bloque de servidor a tu mcp.json.',
		},
		{
			title: 'Marcar como configurado',
			body: 'Opcionalmente registra que este repo ya se configuró una vez.',
		},
	],
};

const fr: ISetupGithubStrings = {
	title: 'Configuration multi-projets',
	intro: 'Intégrez mcp-vertex dans ce dépôt et préparez le plugin issues de GitHub — les mêmes 7 étapes que la commande setup-github.',
	docsLink: 'Lire le guide canonique de configuration multi-projets',
	next: 'Suivant',
	back: 'Précédent',
	copy: 'Copier la commande',
	copied: 'Copié !',
	finish: 'Terminer',
	stepLabel: 'Étape {n} sur {total}',
	optional: 'optionnel',
	steps: [
		{
			title: 'Détecter le dépôt',
			body: 'Lit le remote GitHub et le normalise en owner/name.',
		},
		{
			title: 'Confirmer owner/name',
			body: 'Lancez la commande de configuration et confirmez le slug détecté.',
		},
		{
			title: 'Choisir le niveau d’authentification',
			body: 'gh quand gh auth status réussit, rest-authed avec GITHUB_TOKEN, sinon rest-anon (60 req/h).',
		},
		{
			title: 'Écrire la configuration',
			body: 'Écrit plugins.issues.options.repo dans mcp-vertex.config.json.',
		},
		{
			title: 'Vérifier le niveau',
			body: 'Démarrez l’hôte avec le plugin issues chargé pour éprouver le niveau.',
		},
		{
			title: 'Afficher l’invocation',
			body: 'Ajoutez ce bloc serveur à votre mcp.json.',
		},
		{
			title: 'Marquer comme configuré',
			body: 'Enregistrez éventuellement que ce dépôt a déjà été configuré.',
		},
	],
};

const de: ISetupGithubStrings = {
	title: 'Projektübergreifende Einrichtung',
	intro: 'Binde mcp-vertex in dieses Repository ein und mach das GitHub-Issues-Plugin bereit — dieselben 7 Schritte wie der Befehl setup-github.',
	docsLink:
		'Lies den kanonischen Leitfaden zur projektübergreifenden Einrichtung',
	next: 'Weiter',
	back: 'Zurück',
	copy: 'Befehl kopieren',
	copied: 'Kopiert!',
	finish: 'Fertig',
	stepLabel: 'Schritt {n} von {total}',
	optional: 'optional',
	steps: [
		{
			title: 'Repo erkennen',
			body: 'Liest das GitHub-Remote und normalisiert es zu owner/name.',
		},
		{
			title: 'owner/name bestätigen',
			body: 'Führe den Einrichtungsbefehl aus und bestätige den erkannten Slug.',
		},
		{
			title: 'Auth-Stufe wählen',
			body: 'gh wenn gh auth status erfolgreich, rest-authed mit GITHUB_TOKEN, sonst rest-anon (60 Anfr./h).',
		},
		{
			title: 'Konfiguration schreiben',
			body: 'Schreibt plugins.issues.options.repo in mcp-vertex.config.json.',
		},
		{
			title: 'Stufe verifizieren',
			body: 'Starte den Host mit geladenem Issues-Plugin, um die Stufe zu prüfen.',
		},
		{
			title: 'Aufruf ausgeben',
			body: 'Füge diesen Server-Block zu deiner mcp.json hinzu.',
		},
		{
			title: 'Als konfiguriert markieren',
			body: 'Optional festhalten, dass dieses Repo einmal eingerichtet wurde.',
		},
	],
};

const pt: ISetupGithubStrings = {
	title: 'Configuração entre projetos',
	intro: 'Integre o mcp-vertex neste repositório e deixe o plugin de issues do GitHub pronto — os mesmos 7 passos que o comando setup-github executa.',
	docsLink: 'Leia o guia canônico de configuração entre projetos',
	next: 'Próximo',
	back: 'Voltar',
	copy: 'Copiar comando',
	copied: 'Copiado!',
	finish: 'Concluir',
	stepLabel: 'Passo {n} de {total}',
	optional: 'opcional',
	steps: [
		{
			title: 'Detectar o repo',
			body: 'Lê o remoto do GitHub e normaliza para owner/name.',
		},
		{
			title: 'Confirmar owner/name',
			body: 'Execute o comando de configuração e confirme o slug detectado.',
		},
		{
			title: 'Escolher o nível de autenticação',
			body: 'gh quando gh auth status funciona, rest-authed com GITHUB_TOKEN, ou rest-anon (60 req/h).',
		},
		{
			title: 'Gravar a configuração',
			body: 'Grava plugins.issues.options.repo em mcp-vertex.config.json.',
		},
		{
			title: 'Verificar o nível',
			body: 'Inicie o host com o plugin de issues carregado para exercitar o nível.',
		},
		{
			title: 'Imprimir a invocação',
			body: 'Adicione este bloco de servidor ao seu mcp.json.',
		},
		{
			title: 'Marcar como configurado',
			body: 'Opcionalmente registre que este repo já foi configurado uma vez.',
		},
	],
};

const it: ISetupGithubStrings = {
	title: 'Configurazione tra progetti',
	intro: 'Integra mcp-vertex in questo repository e prepara il plugin issues di GitHub — gli stessi 7 passaggi eseguiti dal comando setup-github.',
	docsLink: 'Leggi la guida canonica alla configurazione tra progetti',
	next: 'Avanti',
	back: 'Indietro',
	copy: 'Copia comando',
	copied: 'Copiato!',
	finish: 'Fine',
	stepLabel: 'Passaggio {n} di {total}',
	optional: 'facoltativo',
	steps: [
		{
			title: 'Rileva il repo',
			body: 'Legge il remote di GitHub e lo normalizza in owner/name.',
		},
		{
			title: 'Conferma owner/name',
			body: 'Esegui il comando di configurazione e conferma lo slug rilevato.',
		},
		{
			title: 'Scegli il livello di autenticazione',
			body: 'gh quando gh auth status riesce, rest-authed con GITHUB_TOKEN, altrimenti rest-anon (60 req/h).',
		},
		{
			title: 'Scrivi la configurazione',
			body: 'Scrive plugins.issues.options.repo in mcp-vertex.config.json.',
		},
		{
			title: 'Verifica il livello',
			body: 'Avvia l’host con il plugin issues caricato per mettere alla prova il livello.',
		},
		{
			title: 'Stampa l’invocazione',
			body: 'Aggiungi questo blocco server al tuo mcp.json.',
		},
		{
			title: 'Segna come configurato',
			body: 'Facoltativamente registra che questo repo è già stato configurato una volta.',
		},
	],
};

const zh: ISetupGithubStrings = {
	title: '跨项目配置',
	intro: '将 mcp-vertex 接入此仓库，并准备好 GitHub issues 插件——与 setup-github 命令执行的 7 个步骤一致。',
	docsLink: '阅读权威的跨项目配置指南',
	next: '下一步',
	back: '上一步',
	copy: '复制命令',
	copied: '已复制！',
	finish: '完成',
	stepLabel: '第 {n} 步，共 {total} 步',
	optional: '可选',
	steps: [
		{ title: '检测仓库', body: '读取 GitHub 远端并规范化为 owner/name。' },
		{
			title: '确认 owner/name',
			body: '运行配置命令并确认检测到的仓库标识。',
		},
		{
			title: '选择认证级别',
			body: 'gh auth status 成功时用 gh，有 GITHUB_TOKEN 时用 rest-authed，否则用 rest-anon（每小时 60 次）。',
		},
		{
			title: '写入配置',
			body: '将 plugins.issues.options.repo 写入 mcp-vertex.config.json。',
		},
		{
			title: '验证级别',
			body: '在加载 issues 插件的情况下启动宿主以验证该级别。',
		},
		{
			title: '打印启动命令',
			body: '将此服务器配置块添加到你的 mcp.json。',
		},
		{ title: '标记为已配置', body: '可选地记录该仓库已配置过一次。' },
	],
};

const hi: ISetupGithubStrings = {
	title: 'क्रॉस-प्रोजेक्ट सेटअप',
	intro: 'mcp-vertex को इस रिपॉज़िटरी में जोड़ें और GitHub issues प्लगइन तैयार करें — वही 7 चरण जो setup-github कमांड चलाता है।',
	docsLink: 'क्रॉस-प्रोजेक्ट सेटअप की आधिकारिक गाइड पढ़ें',
	next: 'अगला',
	back: 'पीछे',
	copy: 'कमांड कॉपी करें',
	copied: 'कॉपी हो गया!',
	finish: 'समाप्त',
	stepLabel: 'चरण {n} / {total}',
	optional: 'वैकल्पिक',
	steps: [
		{
			title: 'रिपॉज़िटरी पहचानें',
			body: 'GitHub रिमोट पढ़कर उसे owner/name में सामान्यीकृत करता है।',
		},
		{
			title: 'owner/name की पुष्टि करें',
			body: 'सेटअप कमांड चलाएँ और पहचाने गए स्लग की पुष्टि करें।',
		},
		{
			title: 'प्रमाणीकरण स्तर चुनें',
			body: 'gh auth status सफल होने पर gh, GITHUB_TOKEN होने पर rest-authed, अन्यथा rest-anon (60/घंटा)।',
		},
		{
			title: 'कॉन्फ़िग लिखें',
			body: 'plugins.issues.options.repo को mcp-vertex.config.json में लिखता है।',
		},
		{
			title: 'स्तर सत्यापित करें',
			body: 'issues प्लगइन लोड करके होस्ट शुरू करें ताकि स्तर परखा जा सके।',
		},
		{
			title: 'इन्वोकेशन प्रिंट करें',
			body: 'यह सर्वर ब्लॉक अपने mcp.json में जोड़ें।',
		},
		{
			title: 'कॉन्फ़िगर किया गया चिह्नित करें',
			body: 'वैकल्पिक रूप से दर्ज करें कि यह रिपॉज़िटरी एक बार कॉन्फ़िगर हो चुकी है।',
		},
	],
};

const ar: ISetupGithubStrings = {
	title: 'الإعداد عبر المشاريع',
	intro: 'اربط mcp-vertex بهذا المستودع وجهّز إضافة issues الخاصة بـ GitHub — نفس الخطوات السبع التي ينفّذها أمر setup-github.',
	docsLink: 'اقرأ الدليل المرجعي للإعداد عبر المشاريع',
	next: 'التالي',
	back: 'السابق',
	copy: 'نسخ الأمر',
	copied: 'تم النسخ!',
	finish: 'إنهاء',
	stepLabel: 'الخطوة {n} من {total}',
	optional: 'اختياري',
	steps: [
		{
			title: 'اكتشاف المستودع',
			body: 'يقرأ ريموت GitHub ويحوّله إلى owner/name.',
		},
		{
			title: 'تأكيد owner/name',
			body: 'شغّل أمر الإعداد وأكّد المعرّف المكتشف.',
		},
		{
			title: 'اختيار مستوى المصادقة',
			body: 'gh عند نجاح gh auth status، وrest-authed مع GITHUB_TOKEN، وإلا rest-anon (60 طلبًا/ساعة).',
		},
		{
			title: 'كتابة الإعدادات',
			body: 'يكتب plugins.issues.options.repo في mcp-vertex.config.json.',
		},
		{
			title: 'التحقق من المستوى',
			body: 'شغّل المضيف مع تحميل إضافة issues لاختبار المستوى.',
		},
		{
			title: 'طباعة أمر التشغيل',
			body: 'أضف كتلة الخادم هذه إلى ملف mcp.json.',
		},
		{
			title: 'وضع علامة كمُهيّأ',
			body: 'سجّل اختياريًا أن هذا المستودع تم إعداده مرة واحدة.',
		},
	],
};

const ja: ISetupGithubStrings = {
	title: 'クロスプロジェクト設定',
	intro: 'このリポジトリに mcp-vertex を組み込み、GitHub issues プラグインを準備します。setup-github コマンドと同じ 7 ステップです。',
	docsLink: '正規のクロスプロジェクト設定ガイドを読む',
	next: '次へ',
	back: '戻る',
	copy: 'コマンドをコピー',
	copied: 'コピーしました！',
	finish: '完了',
	stepLabel: 'ステップ {n} / {total}',
	optional: '任意',
	steps: [
		{
			title: 'リポジトリの検出',
			body: 'GitHub のリモートを読み取り owner/name に正規化します。',
		},
		{
			title: 'owner/name の確認',
			body: 'セットアップコマンドを実行し、検出されたスラッグを確認します。',
		},
		{
			title: '認証ティアの選択',
			body: 'gh auth status 成功時は gh、GITHUB_TOKEN 設定時は rest-authed、それ以外は rest-anon（毎時 60 回）。',
		},
		{
			title: '設定の書き込み',
			body: 'plugins.issues.options.repo を mcp-vertex.config.json に書き込みます。',
		},
		{
			title: 'ティアの検証',
			body: 'issues プラグインを読み込んでホストを起動し、ティアを検証します。',
		},
		{
			title: '起動コマンドの出力',
			body: 'このサーバーブロックを mcp.json に追加します。',
		},
		{
			title: '設定済みとしてマーク',
			body: 'このリポジトリが一度設定済みであることを任意で記録します。',
		},
	],
};

const vi: ISetupGithubStrings = {
	title: 'Thiết lập đa dự án',
	intro: 'Kết nối mcp-vertex vào kho này và chuẩn bị plugin issues của GitHub — đúng 7 bước mà lệnh setup-github thực hiện.',
	docsLink: 'Đọc hướng dẫn thiết lập đa dự án chính thức',
	next: 'Tiếp',
	back: 'Quay lại',
	copy: 'Sao chép lệnh',
	copied: 'Đã sao chép!',
	finish: 'Hoàn tất',
	stepLabel: 'Bước {n}/{total}',
	optional: 'tùy chọn',
	steps: [
		{
			title: 'Phát hiện kho',
			body: 'Đọc remote GitHub và chuẩn hóa thành owner/name.',
		},
		{
			title: 'Xác nhận owner/name',
			body: 'Chạy lệnh thiết lập và xác nhận slug được phát hiện.',
		},
		{
			title: 'Chọn cấp xác thực',
			body: 'gh khi gh auth status thành công, rest-authed với GITHUB_TOKEN, ngược lại rest-anon (60 req/h).',
		},
		{
			title: 'Ghi cấu hình',
			body: 'Ghi plugins.issues.options.repo vào mcp-vertex.config.json.',
		},
		{
			title: 'Xác minh cấp',
			body: 'Khởi chạy host với plugin issues đã nạp để kiểm tra cấp.',
		},
		{
			title: 'In lệnh khởi chạy',
			body: 'Thêm khối server này vào mcp.json của bạn.',
		},
		{
			title: 'Đánh dấu đã cấu hình',
			body: 'Tùy chọn ghi lại rằng kho này đã được cấu hình một lần.',
		},
	],
};

const th: ISetupGithubStrings = {
	title: 'การตั้งค่าข้ามโปรเจกต์',
	intro: 'เชื่อม mcp-vertex เข้ากับรีโพนี้ และเตรียมปลั๊กอิน issues ของ GitHub — เป็น 7 ขั้นตอนเดียวกับที่คำสั่ง setup-github ทำงาน',
	docsLink: 'อ่านคู่มือการตั้งค่าข้ามโปรเจกต์ฉบับหลัก',
	next: 'ถัดไป',
	back: 'ย้อนกลับ',
	copy: 'คัดลอกคำสั่ง',
	copied: 'คัดลอกแล้ว!',
	finish: 'เสร็จสิ้น',
	stepLabel: 'ขั้นที่ {n} จาก {total}',
	optional: 'ไม่บังคับ',
	steps: [
		{
			title: 'ตรวจหารีโพ',
			body: 'อ่าน remote ของ GitHub แล้วแปลงให้อยู่ในรูป owner/name',
		},
		{
			title: 'ยืนยัน owner/name',
			body: 'รันคำสั่งตั้งค่าและยืนยันสลักที่ตรวจพบ',
		},
		{
			title: 'เลือกระดับการยืนยันตัวตน',
			body: 'ใช้ gh เมื่อ gh auth status สำเร็จ, rest-authed เมื่อมี GITHUB_TOKEN, มิฉะนั้น rest-anon (60 ครั้ง/ชม.)',
		},
		{
			title: 'เขียนการตั้งค่า',
			body: 'เขียน plugins.issues.options.repo ลงใน mcp-vertex.config.json',
		},
		{
			title: 'ตรวจสอบระดับ',
			body: 'เริ่มโฮสต์โดยโหลดปลั๊กอิน issues เพื่อทดสอบระดับ',
		},
		{
			title: 'พิมพ์คำสั่งเรียกใช้',
			body: 'เพิ่มบล็อกเซิร์ฟเวอร์นี้ลงใน mcp.json ของคุณ',
		},
		{
			title: 'ทำเครื่องหมายว่าตั้งค่าแล้ว',
			body: 'บันทึกเป็นทางเลือกว่ารีโพนี้ตั้งค่าไปแล้วครั้งหนึ่ง',
		},
	],
};

/** The setup-github webview copy, keyed by language. All 12 present. */
export const setupGithubStringsByLang: Readonly<
	Record<Lang, ISetupGithubStrings>
> = { en, es, fr, de, pt, it, zh, hi, ar, ja, vi, th };

/** Resolve the setup-github copy for a language, falling back to English. */
export const setupGithubStrings = (lang: Lang): ISetupGithubStrings =>
	setupGithubStringsByLang[lang] ?? en;

/**
 * Throw when any supported language is missing the setup-github copy or any
 * leaf string is empty. Mirrors `check-i18n.ts`; exercised by the spec so the
 * test gate enforces 12-language parity.
 */
export const assertSetupGithubStringsComplete = (
	langs: readonly Lang[],
): void => {
	const problems: string[] = [];
	for (const lang of langs) {
		const dict = setupGithubStringsByLang[lang];
		if (!dict) {
			problems.push(`[${lang}] missing setup-github strings`);
			continue;
		}
		const flat: Array<readonly [string, string]> = [
			['title', dict.title],
			['intro', dict.intro],
			['docsLink', dict.docsLink],
			['next', dict.next],
			['back', dict.back],
			['copy', dict.copy],
			['copied', dict.copied],
			['finish', dict.finish],
			['stepLabel', dict.stepLabel],
			['optional', dict.optional],
		];
		for (const [key, value] of flat) {
			if (typeof value !== 'string' || value.trim().length === 0) {
				problems.push(`[${lang}] empty ${key}`);
			}
		}
		if (dict.steps.length !== 7) {
			problems.push(
				`[${lang}] expected 7 steps, got ${dict.steps.length}`,
			);
		}
		dict.steps.forEach((step, i) => {
			if (step.title.trim().length === 0)
				problems.push(`[${lang}] empty step ${i + 1} title`);
			if (step.body.trim().length === 0)
				problems.push(`[${lang}] empty step ${i + 1} body`);
		});
	}
	if (problems.length > 0) {
		throw new Error(
			`setup-github i18n incomplete:\n  ${problems.join('\n  ')}`,
		);
	}
};
