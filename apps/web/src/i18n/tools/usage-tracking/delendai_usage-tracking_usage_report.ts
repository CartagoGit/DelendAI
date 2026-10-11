// i18n catalogue for `delendai_usage-tracking_usage_report`.
//
// Per-tool i18n entry (apps/web/src/i18n/tools/usage-tracking/). 12-lang
// invariant is enforced by `check-i18n.ts` once the entry opts in via
// `apps/web/src/i18n/tools/index.ts`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const usageTrackingUsageReportI18n: IToolI18n = {
	description: {
		en: 'Report recorded tool usage and cost grouped by provider, plugin, agent or extension. Returns totals, the bucketed rollup for the chosen axis, and the top-10 most expensive calls. Reads an append-only log; no message content is ever recorded or returned.',
		es: 'Informa del uso y coste registrado de las herramientas agrupado por proveedor, plugin, agente o extensión. Devuelve totales, el resumen por el eje elegido y las 10 llamadas más caras. Lee un registro de solo anexado; nunca se registra ni se devuelve el contenido de los mensajes.',
		fr: "Rapporte l'utilisation et le coût enregistrés des outils, regroupés par fournisseur, plugin, agent ou extension. Renvoie les totaux, le récapitulatif selon l'axe choisi et les 10 appels les plus coûteux. Lit un journal en ajout seul ; le contenu des messages n'est jamais enregistré ni renvoyé.",
		de: 'Meldet die aufgezeichnete Tool-Nutzung und -Kosten, gruppiert nach Anbieter, Plugin, Agent oder Erweiterung. Liefert Summen, die Aufschlüsselung für die gewählte Achse und die 10 teuersten Aufrufe. Liest ein reines Anhänge-Protokoll; Nachrichteninhalte werden nie gespeichert oder zurückgegeben.',
		it: "Riporta l'uso e il costo registrati degli strumenti, raggruppati per provider, plugin, agente o estensione. Restituisce i totali, il riepilogo per l'asse scelto e le 10 chiamate più costose. Legge un log solo in append; il contenuto dei messaggi non viene mai registrato né restituito.",
		pt: 'Relata o uso e o custo registados das ferramentas, agrupados por fornecedor, plugin, agente ou extensão. Devolve totais, o resumo pelo eixo escolhido e as 10 chamadas mais caras. Lê um registo apenas de anexação; o conteúdo das mensagens nunca é registado nem devolvido.',
		ja: 'プロバイダー、プラグイン、エージェント、拡張機能ごとに記録されたツールの使用量とコストを報告します。合計、選択した軸ごとの集計、最も高価な上位10件の呼び出しを返します。追記専用ログを読み取り、メッセージ本文は記録も返却もしません。',
		zh: '按提供商、插件、代理或扩展分组报告已记录的工具使用量和成本。返回总计、所选维度的汇总以及最昂贵的前10个调用。读取只追加日志;绝不记录或返回消息内容。',
		hi: 'प्रदाता, प्लगइन, एजेंट या एक्सटेंशन के अनुसार समूहित की गई दर्ज टूल उपयोग और लागत की रिपोर्ट देता है। कुल, चुने गए अक्ष के लिए सारांश और शीर्ष-10 सबसे महंगे कॉल लौटाता है। केवल-जोड़ लॉग पढ़ता है; संदेश सामग्री कभी दर्ज या वापस नहीं की जाती।',
		ar: 'يُبلّغ عن استخدام الأدوات وتكلفتها المسجّلة مجمّعة حسب المزوّد أو الملحق أو الوكيل أو الامتداد. يُعيد الإجماليات وملخص المحور المختار وأغلى 10 استدعاءات. يقرأ سجلًا للإلحاق فقط؛ لا يُسجَّل محتوى الرسائل أو يُعاد أبدًا.',
		th: 'รายงานการใช้งานและต้นทุนของเครื่องมือที่บันทึกไว้ โดยจัดกลุ่มตามผู้ให้บริการ ปลั๊กอิน เอเจนต์ หรือส่วนขยาย คืนค่าผลรวม สรุปตามแกนที่เลือก และการเรียกที่แพงที่สุด 10 อันดับแรก อ่านบันทึกแบบผนวกอย่างเดียว ไม่มีการบันทึกหรือส่งคืนเนื้อหาข้อความใด ๆ',
		vi: 'Báo cáo mức sử dụng và chi phí công cụ đã ghi, nhóm theo nhà cung cấp, plugin, tác nhân hoặc tiện ích mở rộng. Trả về tổng số, bản tổng hợp theo trục đã chọn và 10 lệnh gọi tốn kém nhất. Đọc nhật ký chỉ ghi thêm; nội dung tin nhắn không bao giờ được ghi lại hay trả về.',
	},
};
