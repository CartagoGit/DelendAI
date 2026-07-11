/**
 * external-mcps.strings.ts — external-server ack command copy, 12 languages
 * (f00068 S5).
 *
 * Self-contained typed table for the `mcp-vertex.externalMcps.ack` command
 * and its pending-ack notification, following the
 * `provider-dashboard.strings.ts` convention: the copy lives here —
 * cohesive and testable — instead of inflating the shared flat-key
 * surface. Every visible string has all 12 language entries;
 * `assertExternalMcpsStringsComplete` is exercised by the spec so a
 * missing language fails the test gate.
 */
import type { Lang } from './index';

/** All copy the external-mcps ack command + notification need for one language. */
export interface IExternalMcpsStrings {
	/** QuickPick title when choosing a pending activation to decide. */
	readonly pickPending: string;
	/** Shown when there is nothing awaiting a decision. */
	readonly noPending: string;
	/** QuickPick actions: accept / reject one activation. */
	readonly accept: string;
	readonly reject: string;
	/** QuickPick title for the accept/reject choice on a picked server. */
	readonly decidePrompt: string;
	/** Toast confirmations after a decision is recorded. */
	readonly acceptedInfo: string;
	readonly rejectedInfo: string;
	/** Non-modal notification body: "{n} external server(s) await approval". */
	readonly pendingNotification: string;
	/** Notification action button that opens the ack QuickPick. */
	readonly reviewAction: string;
}

const en: IExternalMcpsStrings = {
	pickPending: 'Select a pending external-server activation',
	noPending: 'No external-server activations are awaiting a decision.',
	accept: 'Accept',
	reject: 'Reject',
	decidePrompt: 'Accept or reject this activation?',
	acceptedInfo: 'activation accepted',
	rejectedInfo: 'activation rejected',
	pendingNotification: 'external server(s) awaiting activation approval',
	reviewAction: 'Review',
};

const es: IExternalMcpsStrings = {
	pickPending: 'Selecciona una activación de servidor externo pendiente',
	noPending: 'No hay activaciones de servidores externos esperando decisión.',
	accept: 'Aceptar',
	reject: 'Rechazar',
	decidePrompt: '¿Aceptar o rechazar esta activación?',
	acceptedInfo: 'activación aceptada',
	rejectedInfo: 'activación rechazada',
	pendingNotification:
		'servidor(es) externo(s) esperando aprobación de activación',
	reviewAction: 'Revisar',
};

const fr: IExternalMcpsStrings = {
	pickPending: 'Sélectionnez une activation de serveur externe en attente',
	noPending: 'Aucune activation de serveur externe n’attend de décision.',
	accept: 'Accepter',
	reject: 'Refuser',
	decidePrompt: 'Accepter ou refuser cette activation ?',
	acceptedInfo: 'activation acceptée',
	rejectedInfo: 'activation refusée',
	pendingNotification:
		'serveur(s) externe(s) en attente d’approbation d’activation',
	reviewAction: 'Examiner',
};

const de: IExternalMcpsStrings = {
	pickPending: 'Ausstehende Aktivierung eines externen Servers auswählen',
	noPending: 'Keine Aktivierung eines externen Servers wartet auf Entscheidung.',
	accept: 'Annehmen',
	reject: 'Ablehnen',
	decidePrompt: 'Diese Aktivierung annehmen oder ablehnen?',
	acceptedInfo: 'Aktivierung angenommen',
	rejectedInfo: 'Aktivierung abgelehnt',
	pendingNotification: 'externe(r) Server wartet auf Aktivierungsfreigabe',
	reviewAction: 'Prüfen',
};

const it: IExternalMcpsStrings = {
	pickPending: 'Seleziona un’attivazione di server esterno in sospeso',
	noPending: 'Nessuna attivazione di server esterno in attesa di decisione.',
	accept: 'Accetta',
	reject: 'Rifiuta',
	decidePrompt: 'Accettare o rifiutare questa attivazione?',
	acceptedInfo: 'attivazione accettata',
	rejectedInfo: 'attivazione rifiutata',
	pendingNotification:
		'server esterno(i) in attesa di approvazione dell’attivazione',
	reviewAction: 'Rivedi',
};

const pt: IExternalMcpsStrings = {
	pickPending: 'Selecione uma ativação de servidor externo pendente',
	noPending: 'Nenhuma ativação de servidor externo aguardando decisão.',
	accept: 'Aceitar',
	reject: 'Rejeitar',
	decidePrompt: 'Aceitar ou rejeitar esta ativação?',
	acceptedInfo: 'ativação aceita',
	rejectedInfo: 'ativação rejeitada',
	pendingNotification:
		'servidor(es) externo(s) aguardando aprovação de ativação',
	reviewAction: 'Revisar',
};

const ja: IExternalMcpsStrings = {
	pickPending: '保留中の外部サーバー有効化を選択',
	noPending: '決定待ちの外部サーバー有効化はありません。',
	accept: '承認',
	reject: '拒否',
	decidePrompt: 'この有効化を承認しますか、拒否しますか？',
	acceptedInfo: '有効化を承認しました',
	rejectedInfo: '有効化を拒否しました',
	pendingNotification: '個の外部サーバーが有効化の承認待ちです',
	reviewAction: '確認',
};

const zh: IExternalMcpsStrings = {
	pickPending: '选择一个待处理的外部服务器激活',
	noPending: '没有等待决定的外部服务器激活。',
	accept: '接受',
	reject: '拒绝',
	decidePrompt: '接受还是拒绝此次激活？',
	acceptedInfo: '激活已接受',
	rejectedInfo: '激活已拒绝',
	pendingNotification: '个外部服务器等待激活批准',
	reviewAction: '查看',
};

const hi: IExternalMcpsStrings = {
	pickPending: 'एक लंबित बाहरी सर्वर सक्रियण चुनें',
	noPending: 'कोई बाहरी सर्वर सक्रियण निर्णय की प्रतीक्षा में नहीं है।',
	accept: 'स्वीकार करें',
	reject: 'अस्वीकार करें',
	decidePrompt: 'इस सक्रियण को स्वीकार करें या अस्वीकार करें?',
	acceptedInfo: 'सक्रियण स्वीकृत',
	rejectedInfo: 'सक्रियण अस्वीकृत',
	pendingNotification: 'बाहरी सर्वर सक्रियण अनुमोदन की प्रतीक्षा में',
	reviewAction: 'समीक्षा करें',
};

const ar: IExternalMcpsStrings = {
	pickPending: 'اختر تفعيل خادم خارجي معلّق',
	noPending: 'لا يوجد تفعيل خادم خارجي بانتظار قرار.',
	accept: 'قبول',
	reject: 'رفض',
	decidePrompt: 'قبول هذا التفعيل أم رفضه؟',
	acceptedInfo: 'تم قبول التفعيل',
	rejectedInfo: 'تم رفض التفعيل',
	pendingNotification: 'خادم(خوادم) خارجي بانتظار الموافقة على التفعيل',
	reviewAction: 'مراجعة',
};

const th: IExternalMcpsStrings = {
	pickPending: 'เลือกการเปิดใช้งานเซิร์ฟเวอร์ภายนอกที่รอดำเนินการ',
	noPending: 'ไม่มีการเปิดใช้งานเซิร์ฟเวอร์ภายนอกที่รอการตัดสินใจ',
	accept: 'ยอมรับ',
	reject: 'ปฏิเสธ',
	decidePrompt: 'ยอมรับหรือปฏิเสธการเปิดใช้งานนี้?',
	acceptedInfo: 'ยอมรับการเปิดใช้งานแล้ว',
	rejectedInfo: 'ปฏิเสธการเปิดใช้งานแล้ว',
	pendingNotification: 'เซิร์ฟเวอร์ภายนอกกำลังรอการอนุมัติการเปิดใช้งาน',
	reviewAction: 'ตรวจสอบ',
};

const vi: IExternalMcpsStrings = {
	pickPending: 'Chọn một kích hoạt máy chủ ngoài đang chờ',
	noPending: 'Không có kích hoạt máy chủ ngoài nào đang chờ quyết định.',
	accept: 'Chấp nhận',
	reject: 'Từ chối',
	decidePrompt: 'Chấp nhận hay từ chối kích hoạt này?',
	acceptedInfo: 'đã chấp nhận kích hoạt',
	rejectedInfo: 'đã từ chối kích hoạt',
	pendingNotification: 'máy chủ ngoài đang chờ phê duyệt kích hoạt',
	reviewAction: 'Xem lại',
};

/** All 12 languages, keyed by `Lang` (f00030 §5.4 completeness rule). */
export const externalMcpsStringsByLang: Readonly<
	Record<Lang, IExternalMcpsStrings>
> = { en, es, fr, de, it, pt, ja, zh, hi, ar, th, vi };

/**
 * Spec-exercised completeness guard, mirroring
 * `assertProviderDashboardStringsComplete`: every language present, every
 * string non-empty. Returns the list of problems (empty = complete).
 */
export const assertExternalMcpsStringsComplete = (): readonly string[] => {
	const problems: string[] = [];
	for (const [lang, strings] of Object.entries(externalMcpsStringsByLang)) {
		for (const [key, value] of Object.entries(strings)) {
			if (typeof value !== 'string' || value.trim().length === 0) {
				problems.push(`[${lang}] ${key} is empty`);
			}
		}
	}
	return problems;
};
