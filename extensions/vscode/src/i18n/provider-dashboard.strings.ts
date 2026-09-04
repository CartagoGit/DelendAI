/**
 * provider-dashboard.strings.ts — provider panel copy, 12 languages
 * (f00098 S3).
 *
 * Self-contained typed table for the provider-dashboard webview and its
 * commands, following the `strings.ts` (setup-github) convention: the
 * copy lives here — cohesive and testable — instead of inflating the
 * shared flat-key surface. Every visible string has all 12 language
 * entries; `assertProviderDashboardStringsComplete` is exercised by the
 * spec so a missing language fails the test gate.
 *
 * The builder-produced texts (plugin-absent hint, opt-in snippet) come
 * from `@delendai/ui-extension` and are rendered verbatim — only the
 * host-side chrome (titles, table headers, action prompts) is localized
 * here.
 */
import type { Lang } from './index';

/** All copy the provider dashboard webview + commands need for one language. */
export interface IProviderDashboardStrings {
	/** Webview panel + heading title. */
	readonly title: string;
	readonly providersTitle: string;
	readonly usageTitle: string;
	/** Provider table headers. */
	readonly colProvider: string;
	readonly colState: string;
	readonly colModel: string;
	readonly colCli: string;
	readonly colAuth: string;
	readonly colQuota: string;
	readonly reachable: string;
	readonly unreachable: string;
	readonly installHint: string;
	readonly noQuota: string;
	readonly emptyRoster: string;
	readonly checkedAt: string;
	/** "{n} total · {n} available · {n} unavailable" fragments. */
	readonly total: string;
	readonly available: string;
	readonly unavailable: string;
	/** Usage card labels. */
	readonly totalSpend: string;
	readonly calls: string;
	readonly tokens: string;
	readonly errors: string;
	readonly windowDays: string;
	readonly sessionMeter: string;
	readonly monthlyMeter: string;
	readonly uncapped: string;
	readonly breached: string;
	readonly share: string;
	readonly emptyLog: string;
	readonly limitsUnavailable: string;
	/** Plugin-absent section title (hint body comes from the builder). */
	readonly optInTitle: string;
	/** Command prompts + toasts. */
	readonly pickProvider: string;
	readonly reasonPrompt: string;
	readonly pausedInfo: string;
	readonly resumedInfo: string;
	readonly healthcheckDone: string;
	readonly clearConfirm: string;
	readonly clearConfirmYes: string;
	readonly clearedInfo: string;
}

const en: IProviderDashboardStrings = {
	title: 'Provider dashboard',
	providersTitle: 'Providers',
	usageTitle: 'Usage & cost',
	colProvider: 'Provider',
	colState: 'State',
	colModel: 'Model',
	colCli: 'CLI',
	colAuth: 'Auth',
	colQuota: 'Quota',
	reachable: 'reachable',
	unreachable: 'unreachable',
	installHint: 'Install hint',
	noQuota: 'no quota data',
	emptyRoster:
		'No providers configured — add a root-level providers block to mcp-vertex.config.json.',
	checkedAt: 'Checked at',
	total: 'total',
	available: 'available',
	unavailable: 'unavailable',
	totalSpend: 'Total spend',
	calls: 'calls',
	tokens: 'tokens',
	errors: 'errors',
	windowDays: 'window (days)',
	sessionMeter: 'Session spend',
	monthlyMeter: 'Monthly spend',
	uncapped: 'uncapped',
	breached: 'limit breached',
	share: 'share',
	emptyLog: 'No usage recorded in this window.',
	limitsUnavailable: 'Spend limits unavailable (advise_spend not reachable).',
	optInTitle: 'Plugin not loaded',
	pickProvider: 'Select a provider',
	reasonPrompt: 'Reason (recorded in the availability mirror)',
	pausedInfo: 'provider paused',
	resumedInfo: 'provider resumed',
	healthcheckDone: 'provider healthcheck refreshed',
	clearConfirm: 'Clear the entire usage log? This cannot be undone.',
	clearConfirmYes: 'Clear log',
	clearedInfo: 'usage log cleared',
};

const es: IProviderDashboardStrings = {
	title: 'Panel de proveedores',
	providersTitle: 'Proveedores',
	usageTitle: 'Uso y coste',
	colProvider: 'Proveedor',
	colState: 'Estado',
	colModel: 'Modelo',
	colCli: 'CLI',
	colAuth: 'Autenticación',
	colQuota: 'Cuota',
	reachable: 'alcanzable',
	unreachable: 'no alcanzable',
	installHint: 'Pista de instalación',
	noQuota: 'sin datos de cuota',
	emptyRoster:
		'No hay proveedores configurados — añade un bloque providers de nivel raíz a mcp-vertex.config.json.',
	checkedAt: 'Comprobado a las',
	total: 'en total',
	available: 'disponibles',
	unavailable: 'no disponibles',
	totalSpend: 'Gasto total',
	calls: 'llamadas',
	tokens: 'tokens',
	errors: 'errores',
	windowDays: 'ventana (días)',
	sessionMeter: 'Gasto de sesión',
	monthlyMeter: 'Gasto mensual',
	uncapped: 'sin límite',
	breached: 'límite superado',
	share: 'cuota',
	emptyLog: 'Sin uso registrado en esta ventana.',
	limitsUnavailable:
		'Límites de gasto no disponibles (advise_spend inaccesible).',
	optInTitle: 'Plugin no cargado',
	pickProvider: 'Selecciona un proveedor',
	reasonPrompt: 'Motivo (se registra en el espejo de disponibilidad)',
	pausedInfo: 'proveedor pausado',
	resumedInfo: 'proveedor reanudado',
	healthcheckDone: 'healthcheck de proveedores actualizado',
	clearConfirm: '¿Borrar todo el registro de uso? No se puede deshacer.',
	clearConfirmYes: 'Borrar registro',
	clearedInfo: 'registro de uso borrado',
};

const fr: IProviderDashboardStrings = {
	title: 'Tableau de bord des fournisseurs',
	providersTitle: 'Fournisseurs',
	usageTitle: 'Utilisation et coût',
	colProvider: 'Fournisseur',
	colState: 'État',
	colModel: 'Modèle',
	colCli: 'CLI',
	colAuth: 'Authentification',
	colQuota: 'Quota',
	reachable: 'joignable',
	unreachable: 'injoignable',
	installHint: 'Aide à l’installation',
	noQuota: 'pas de données de quota',
	emptyRoster:
		'Aucun fournisseur configuré — ajoutez un bloc providers à la racine de mcp-vertex.config.json.',
	checkedAt: 'Vérifié à',
	total: 'au total',
	available: 'disponibles',
	unavailable: 'indisponibles',
	totalSpend: 'Dépense totale',
	calls: 'appels',
	tokens: 'jetons',
	errors: 'erreurs',
	windowDays: 'fenêtre (jours)',
	sessionMeter: 'Dépense de session',
	monthlyMeter: 'Dépense mensuelle',
	uncapped: 'sans plafond',
	breached: 'plafond dépassé',
	share: 'part',
	emptyLog: 'Aucune utilisation enregistrée dans cette fenêtre.',
	limitsUnavailable:
		'Limites de dépense indisponibles (advise_spend injoignable).',
	optInTitle: 'Plugin non chargé',
	pickProvider: 'Sélectionnez un fournisseur',
	reasonPrompt: 'Motif (enregistré dans le miroir de disponibilité)',
	pausedInfo: 'fournisseur mis en pause',
	resumedInfo: 'fournisseur réactivé',
	healthcheckDone: 'healthcheck des fournisseurs actualisé',
	clearConfirm:
		'Effacer tout le journal d’utilisation ? Action irréversible.',
	clearConfirmYes: 'Effacer le journal',
	clearedInfo: 'journal d’utilisation effacé',
};

const de: IProviderDashboardStrings = {
	title: 'Provider-Dashboard',
	providersTitle: 'Provider',
	usageTitle: 'Nutzung & Kosten',
	colProvider: 'Provider',
	colState: 'Status',
	colModel: 'Modell',
	colCli: 'CLI',
	colAuth: 'Auth',
	colQuota: 'Kontingent',
	reachable: 'erreichbar',
	unreachable: 'nicht erreichbar',
	installHint: 'Installationshinweis',
	noQuota: 'keine Kontingentdaten',
	emptyRoster:
		'Keine Provider konfiguriert — füge einen providers-Block auf Wurzelebene in mcp-vertex.config.json hinzu.',
	checkedAt: 'Geprüft um',
	total: 'gesamt',
	available: 'verfügbar',
	unavailable: 'nicht verfügbar',
	totalSpend: 'Gesamtausgaben',
	calls: 'Aufrufe',
	tokens: 'Tokens',
	errors: 'Fehler',
	windowDays: 'Zeitfenster (Tage)',
	sessionMeter: 'Sitzungsausgaben',
	monthlyMeter: 'Monatsausgaben',
	uncapped: 'unbegrenzt',
	breached: 'Limit überschritten',
	share: 'Anteil',
	emptyLog: 'Keine Nutzung in diesem Zeitfenster.',
	limitsUnavailable:
		'Ausgabenlimits nicht verfügbar (advise_spend nicht erreichbar).',
	optInTitle: 'Plugin nicht geladen',
	pickProvider: 'Provider auswählen',
	reasonPrompt: 'Grund (wird im Verfügbarkeitsspiegel gespeichert)',
	pausedInfo: 'Provider pausiert',
	resumedInfo: 'Provider fortgesetzt',
	healthcheckDone: 'Provider-Healthcheck aktualisiert',
	clearConfirm:
		'Das gesamte Nutzungsprotokoll löschen? Das kann nicht rückgängig gemacht werden.',
	clearConfirmYes: 'Protokoll löschen',
	clearedInfo: 'Nutzungsprotokoll gelöscht',
};

const it: IProviderDashboardStrings = {
	title: 'Pannello dei provider',
	providersTitle: 'Provider',
	usageTitle: 'Utilizzo e costi',
	colProvider: 'Provider',
	colState: 'Stato',
	colModel: 'Modello',
	colCli: 'CLI',
	colAuth: 'Autenticazione',
	colQuota: 'Quota',
	reachable: 'raggiungibile',
	unreachable: 'non raggiungibile',
	installHint: 'Suggerimento di installazione',
	noQuota: 'nessun dato di quota',
	emptyRoster:
		'Nessun provider configurato — aggiungi un blocco providers a livello radice in mcp-vertex.config.json.',
	checkedAt: 'Verificato alle',
	total: 'in totale',
	available: 'disponibili',
	unavailable: 'non disponibili',
	totalSpend: 'Spesa totale',
	calls: 'chiamate',
	tokens: 'token',
	errors: 'errori',
	windowDays: 'finestra (giorni)',
	sessionMeter: 'Spesa di sessione',
	monthlyMeter: 'Spesa mensile',
	uncapped: 'senza limite',
	breached: 'limite superato',
	share: 'quota',
	emptyLog: 'Nessun utilizzo registrato in questa finestra.',
	limitsUnavailable:
		'Limiti di spesa non disponibili (advise_spend non raggiungibile).',
	optInTitle: 'Plugin non caricato',
	pickProvider: 'Seleziona un provider',
	reasonPrompt: 'Motivo (registrato nello specchio di disponibilità)',
	pausedInfo: 'provider in pausa',
	resumedInfo: 'provider ripreso',
	healthcheckDone: 'healthcheck dei provider aggiornato',
	clearConfirm:
		'Cancellare tutto il registro di utilizzo? Operazione irreversibile.',
	clearConfirmYes: 'Cancella registro',
	clearedInfo: 'registro di utilizzo cancellato',
};

const pt: IProviderDashboardStrings = {
	title: 'Painel de provedores',
	providersTitle: 'Provedores',
	usageTitle: 'Uso e custo',
	colProvider: 'Provedor',
	colState: 'Estado',
	colModel: 'Modelo',
	colCli: 'CLI',
	colAuth: 'Autenticação',
	colQuota: 'Cota',
	reachable: 'alcançável',
	unreachable: 'inalcançável',
	installHint: 'Dica de instalação',
	noQuota: 'sem dados de cota',
	emptyRoster:
		'Nenhum provedor configurado — adicione um bloco providers de nível raiz em mcp-vertex.config.json.',
	checkedAt: 'Verificado às',
	total: 'no total',
	available: 'disponíveis',
	unavailable: 'indisponíveis',
	totalSpend: 'Gasto total',
	calls: 'chamadas',
	tokens: 'tokens',
	errors: 'erros',
	windowDays: 'janela (dias)',
	sessionMeter: 'Gasto da sessão',
	monthlyMeter: 'Gasto mensal',
	uncapped: 'sem limite',
	breached: 'limite excedido',
	share: 'parcela',
	emptyLog: 'Nenhum uso registrado nesta janela.',
	limitsUnavailable:
		'Limites de gasto indisponíveis (advise_spend inacessível).',
	optInTitle: 'Plugin não carregado',
	pickProvider: 'Selecione um provedor',
	reasonPrompt: 'Motivo (registrado no espelho de disponibilidade)',
	pausedInfo: 'provedor pausado',
	resumedInfo: 'provedor retomado',
	healthcheckDone: 'healthcheck de provedores atualizado',
	clearConfirm: 'Limpar todo o registro de uso? Isso não pode ser desfeito.',
	clearConfirmYes: 'Limpar registro',
	clearedInfo: 'registro de uso limpo',
};

const ja: IProviderDashboardStrings = {
	title: 'プロバイダーダッシュボード',
	providersTitle: 'プロバイダー',
	usageTitle: '使用量とコスト',
	colProvider: 'プロバイダー',
	colState: '状態',
	colModel: 'モデル',
	colCli: 'CLI',
	colAuth: '認証',
	colQuota: 'クォータ',
	reachable: '到達可能',
	unreachable: '到達不可',
	installHint: 'インストールのヒント',
	noQuota: 'クォータデータなし',
	emptyRoster:
		'プロバイダーが未設定です — mcp-vertex.config.json のルートに providers ブロックを追加してください。',
	checkedAt: '確認時刻',
	total: '合計',
	available: '利用可能',
	unavailable: '利用不可',
	totalSpend: '総支出',
	calls: '呼び出し',
	tokens: 'トークン',
	errors: 'エラー',
	windowDays: 'ウィンドウ（日）',
	sessionMeter: 'セッション支出',
	monthlyMeter: '月間支出',
	uncapped: '上限なし',
	breached: '上限超過',
	share: '割合',
	emptyLog: 'このウィンドウに記録された使用はありません。',
	limitsUnavailable:
		'支出上限を取得できません（advise_spend に到達できません）。',
	optInTitle: 'プラグイン未ロード',
	pickProvider: 'プロバイダーを選択',
	reasonPrompt: '理由（可用性ミラーに記録されます）',
	pausedInfo: 'プロバイダーを一時停止しました',
	resumedInfo: 'プロバイダーを再開しました',
	healthcheckDone: 'プロバイダーのヘルスチェックを更新しました',
	clearConfirm: '使用ログを完全に消去しますか？元に戻せません。',
	clearConfirmYes: 'ログを消去',
	clearedInfo: '使用ログを消去しました',
};

const zh: IProviderDashboardStrings = {
	title: '提供方仪表盘',
	providersTitle: '提供方',
	usageTitle: '用量与成本',
	colProvider: '提供方',
	colState: '状态',
	colModel: '模型',
	colCli: 'CLI',
	colAuth: '认证',
	colQuota: '配额',
	reachable: '可达',
	unreachable: '不可达',
	installHint: '安装提示',
	noQuota: '无配额数据',
	emptyRoster:
		'未配置任何提供方 — 请在 mcp-vertex.config.json 的根级添加 providers 块。',
	checkedAt: '检查时间',
	total: '总计',
	available: '可用',
	unavailable: '不可用',
	totalSpend: '总支出',
	calls: '调用',
	tokens: '令牌',
	errors: '错误',
	windowDays: '窗口（天）',
	sessionMeter: '会话支出',
	monthlyMeter: '月度支出',
	uncapped: '无上限',
	breached: '超出限额',
	share: '占比',
	emptyLog: '此窗口内没有记录任何用量。',
	limitsUnavailable: '支出限额不可用（advise_spend 不可达）。',
	optInTitle: '插件未加载',
	pickProvider: '选择提供方',
	reasonPrompt: '原因（记录在可用性镜像中）',
	pausedInfo: '提供方已暂停',
	resumedInfo: '提供方已恢复',
	healthcheckDone: '提供方健康检查已刷新',
	clearConfirm: '清空整个用量日志？此操作无法撤销。',
	clearConfirmYes: '清空日志',
	clearedInfo: '用量日志已清空',
};

const hi: IProviderDashboardStrings = {
	title: 'प्रोवाइडर डैशबोर्ड',
	providersTitle: 'प्रोवाइडर',
	usageTitle: 'उपयोग और लागत',
	colProvider: 'प्रोवाइडर',
	colState: 'स्थिति',
	colModel: 'मॉडल',
	colCli: 'CLI',
	colAuth: 'प्रमाणीकरण',
	colQuota: 'कोटा',
	reachable: 'पहुँच योग्य',
	unreachable: 'पहुँच से बाहर',
	installHint: 'इंस्टॉल संकेत',
	noQuota: 'कोटा डेटा नहीं',
	emptyRoster:
		'कोई प्रोवाइडर कॉन्फ़िगर नहीं — mcp-vertex.config.json में रूट-स्तरीय providers ब्लॉक जोड़ें।',
	checkedAt: 'जाँच समय',
	total: 'कुल',
	available: 'उपलब्ध',
	unavailable: 'अनुपलब्ध',
	totalSpend: 'कुल खर्च',
	calls: 'कॉल',
	tokens: 'टोकन',
	errors: 'त्रुटियाँ',
	windowDays: 'विंडो (दिन)',
	sessionMeter: 'सत्र खर्च',
	monthlyMeter: 'मासिक खर्च',
	uncapped: 'बिना सीमा',
	breached: 'सीमा पार',
	share: 'हिस्सा',
	emptyLog: 'इस विंडो में कोई उपयोग दर्ज नहीं।',
	limitsUnavailable: 'खर्च सीमाएँ अनुपलब्ध (advise_spend पहुँच से बाहर)।',
	optInTitle: 'प्लगइन लोड नहीं है',
	pickProvider: 'प्रोवाइडर चुनें',
	reasonPrompt: 'कारण (उपलब्धता मिरर में दर्ज होता है)',
	pausedInfo: 'प्रोवाइडर रोका गया',
	resumedInfo: 'प्रोवाइडर फिर से चालू',
	healthcheckDone: 'प्रोवाइडर हेल्थचेक ताज़ा किया गया',
	clearConfirm: 'पूरा उपयोग लॉग मिटाएँ? इसे वापस नहीं किया जा सकता।',
	clearConfirmYes: 'लॉग मिटाएँ',
	clearedInfo: 'उपयोग लॉग मिटाया गया',
};

const ar: IProviderDashboardStrings = {
	title: 'لوحة مزوّدي النماذج',
	providersTitle: 'المزوّدون',
	usageTitle: 'الاستخدام والتكلفة',
	colProvider: 'المزوّد',
	colState: 'الحالة',
	colModel: 'النموذج',
	colCli: 'CLI',
	colAuth: 'المصادقة',
	colQuota: 'الحصة',
	reachable: 'متاح الوصول',
	unreachable: 'تعذّر الوصول',
	installHint: 'تلميح التثبيت',
	noQuota: 'لا بيانات حصة',
	emptyRoster:
		'لا يوجد مزوّدون مُهيّأون — أضف كتلة providers في جذر mcp-vertex.config.json.',
	checkedAt: 'تم الفحص في',
	total: 'الإجمالي',
	available: 'متاح',
	unavailable: 'غير متاح',
	totalSpend: 'إجمالي الإنفاق',
	calls: 'استدعاءات',
	tokens: 'رموز',
	errors: 'أخطاء',
	windowDays: 'النافذة (أيام)',
	sessionMeter: 'إنفاق الجلسة',
	monthlyMeter: 'الإنفاق الشهري',
	uncapped: 'بلا سقف',
	breached: 'تجاوز الحد',
	share: 'الحصة',
	emptyLog: 'لا استخدام مسجَّل في هذه النافذة.',
	limitsUnavailable: 'حدود الإنفاق غير متاحة (تعذّر الوصول إلى advise_spend).',
	optInTitle: 'الإضافة غير محمّلة',
	pickProvider: 'اختر مزوّدًا',
	reasonPrompt: 'السبب (يُسجَّل في مرآة التوفّر)',
	pausedInfo: 'تم إيقاف المزوّد مؤقتًا',
	resumedInfo: 'تم استئناف المزوّد',
	healthcheckDone: 'تم تحديث فحص صحة المزوّدين',
	clearConfirm: 'مسح سجلّ الاستخدام بالكامل؟ لا يمكن التراجع.',
	clearConfirmYes: 'مسح السجلّ',
	clearedInfo: 'تم مسح سجلّ الاستخدام',
};

const th: IProviderDashboardStrings = {
	title: 'แดชบอร์ดผู้ให้บริการ',
	providersTitle: 'ผู้ให้บริการ',
	usageTitle: 'การใช้งานและค่าใช้จ่าย',
	colProvider: 'ผู้ให้บริการ',
	colState: 'สถานะ',
	colModel: 'โมเดล',
	colCli: 'CLI',
	colAuth: 'การยืนยันตัวตน',
	colQuota: 'โควตา',
	reachable: 'เข้าถึงได้',
	unreachable: 'เข้าถึงไม่ได้',
	installHint: 'คำแนะนำการติดตั้ง',
	noQuota: 'ไม่มีข้อมูลโควตา',
	emptyRoster:
		'ยังไม่ได้กำหนดผู้ให้บริการ — เพิ่มบล็อก providers ระดับรากใน mcp-vertex.config.json',
	checkedAt: 'ตรวจสอบเมื่อ',
	total: 'ทั้งหมด',
	available: 'พร้อมใช้งาน',
	unavailable: 'ไม่พร้อมใช้งาน',
	totalSpend: 'ค่าใช้จ่ายรวม',
	calls: 'การเรียก',
	tokens: 'โทเคน',
	errors: 'ข้อผิดพลาด',
	windowDays: 'ช่วงเวลา (วัน)',
	sessionMeter: 'ค่าใช้จ่ายของเซสชัน',
	monthlyMeter: 'ค่าใช้จ่ายรายเดือน',
	uncapped: 'ไม่จำกัด',
	breached: 'เกินขีดจำกัด',
	share: 'สัดส่วน',
	emptyLog: 'ไม่มีการใช้งานที่บันทึกในช่วงเวลานี้',
	limitsUnavailable: 'ไม่ทราบขีดจำกัดค่าใช้จ่าย (เข้าถึง advise_spend ไม่ได้)',
	optInTitle: 'ยังไม่ได้โหลดปลั๊กอิน',
	pickProvider: 'เลือกผู้ให้บริการ',
	reasonPrompt: 'เหตุผล (บันทึกในมิเรอร์ความพร้อมใช้งาน)',
	pausedInfo: 'หยุดผู้ให้บริการชั่วคราวแล้ว',
	resumedInfo: 'กลับมาใช้ผู้ให้บริการแล้ว',
	healthcheckDone: 'รีเฟรชเฮลท์เช็กผู้ให้บริการแล้ว',
	clearConfirm: 'ล้างบันทึกการใช้งานทั้งหมด? ไม่สามารถย้อนกลับได้',
	clearConfirmYes: 'ล้างบันทึก',
	clearedInfo: 'ล้างบันทึกการใช้งานแล้ว',
};

const vi: IProviderDashboardStrings = {
	title: 'Bảng điều khiển nhà cung cấp',
	providersTitle: 'Nhà cung cấp',
	usageTitle: 'Sử dụng & chi phí',
	colProvider: 'Nhà cung cấp',
	colState: 'Trạng thái',
	colModel: 'Mô hình',
	colCli: 'CLI',
	colAuth: 'Xác thực',
	colQuota: 'Hạn mức',
	reachable: 'kết nối được',
	unreachable: 'không kết nối được',
	installHint: 'Gợi ý cài đặt',
	noQuota: 'không có dữ liệu hạn mức',
	emptyRoster:
		'Chưa cấu hình nhà cung cấp nào — thêm khối providers ở cấp gốc vào mcp-vertex.config.json.',
	checkedAt: 'Kiểm tra lúc',
	total: 'tổng',
	available: 'khả dụng',
	unavailable: 'không khả dụng',
	totalSpend: 'Tổng chi tiêu',
	calls: 'lượt gọi',
	tokens: 'token',
	errors: 'lỗi',
	windowDays: 'cửa sổ (ngày)',
	sessionMeter: 'Chi tiêu phiên',
	monthlyMeter: 'Chi tiêu tháng',
	uncapped: 'không giới hạn',
	breached: 'vượt giới hạn',
	share: 'tỷ trọng',
	emptyLog: 'Không có mức sử dụng nào được ghi trong cửa sổ này.',
	limitsUnavailable:
		'Không lấy được giới hạn chi tiêu (không truy cập được advise_spend).',
	optInTitle: 'Plugin chưa được tải',
	pickProvider: 'Chọn nhà cung cấp',
	reasonPrompt: 'Lý do (được ghi vào bản sao khả dụng)',
	pausedInfo: 'đã tạm dừng nhà cung cấp',
	resumedInfo: 'đã tiếp tục nhà cung cấp',
	healthcheckDone: 'đã làm mới healthcheck nhà cung cấp',
	clearConfirm: 'Xóa toàn bộ nhật ký sử dụng? Không thể hoàn tác.',
	clearConfirmYes: 'Xóa nhật ký',
	clearedInfo: 'đã xóa nhật ký sử dụng',
};

/** All 12 languages, keyed by `Lang` (f00030 §5.4 completeness rule). */
export const providerDashboardStringsByLang: Readonly<
	Record<Lang, IProviderDashboardStrings>
> = { en, es, fr, de, it, pt, ja, zh, hi, ar, th, vi };

/**
 * Spec-exercised completeness guard, mirroring
 * `assertSetupGithubStringsComplete`: every language present, every string
 * non-empty. Returns the list of problems (empty = complete).
 */
export const assertProviderDashboardStringsComplete = (): readonly string[] => {
	const problems: string[] = [];
	for (const [lang, strings] of Object.entries(
		providerDashboardStringsByLang,
	)) {
		for (const [key, value] of Object.entries(strings)) {
			if (typeof value !== 'string' || value.trim().length === 0) {
				problems.push(`[${lang}] ${key} is empty`);
			}
		}
	}
	return problems;
};
