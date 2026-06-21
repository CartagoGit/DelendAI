// i18n catalogue for `proposals_compact_status`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsCompactStatusI18n: IToolI18n = {
	description: {
		en: 'Aggregates the proposals plugin state in ONE low-token call: active locks, queue backpressure (queued/promoted/waiterOrphans/threshold) and proposal counts by status. Use `fields` (["locks","queue","proposals"]) to shrink it further. Read-only.',
		es: 'Agrega el estado del plugin de proposals en UNA sola llamada de pocos tokens: locks activos, backpressure de la cola (queued/promoted/waiterOrphans/threshold) y recuentos de propuestas por estado. Usa `fields` (["locks","queue","proposals"]) para reducirlo aún más. Solo lectura.',
		fr: 'Agrège l\'état du plugin proposals en UN seul appel à faible coût en tokens : verrous actifs, contre-pression de file (queued/promoted/waiterOrphans/threshold) et comptages de propositions par statut. Utilisez `fields` (["locks","queue","proposals"]) pour le réduire davantage. Lecture seule.',
		de: 'Aggregiert den Zustand des Proposals-Plugins in EINEM token-armen Aufruf: aktive Sperren, Warteschlangen-Gegendruck (queued/promoted/waiterOrphans/threshold) und Vorschlagszahlen nach Status. Verwende `fields` (["locks","queue","proposals"]), um es weiter zu verkleinern. Nur lesend.',
		it: 'Aggrega lo stato del plugin proposals in UNA sola chiamata a basso consumo di token: lock attivi, backpressure della coda (queued/promoted/waiterOrphans/threshold) e conteggi delle proposte per stato. Usa `fields` (["locks","queue","proposals"]) per ridurlo ulteriormente. Solo lettura.',
		pt: 'Agrega o estado do plugin proposals numa ÚNICA chamada de baixo consumo de tokens: locks ativos, contrapressão da fila (queued/promoted/waiterOrphans/threshold) e contagens de propostas por estado. Usa `fields` (["locks","queue","proposals"]) para reduzir ainda mais. Apenas leitura.',
		ja: 'proposals プラグインの状態を 1 回の低トークン呼び出しで集約します:アクティブなロック、キューのバックプレッシャー(queued/promoted/waiterOrphans/threshold)、ステータス別の提案数。`fields`(["locks","queue","proposals"])を使ってさらに縮小できます。読み取り専用。',
		zh: '在一次低令牌调用中汇总 proposals 插件的状态:活动锁、队列反压(queued/promoted/waiterOrphans/threshold)和按状态统计的提案数量。使用 `fields`(["locks","queue","proposals"])进一步缩减。只读。',
		hi: 'proposals प्लगइन की स्थिति को एक कम-टोकन कॉल में एकत्रित करता है: एक्टिव लॉक्स, क्यू बैकप्रेशर (queued/promoted/waiterOrphans/threshold), और स्टेटस के अनुसार प्रस्ताव गणनाएँ। इसे और कम करने के लिए `fields` (["locks","queue","proposals"]) का उपयोग करें। केवल पढ़ने के लिए।',
		ar: 'يجمع حالة إضافة proposals في استدعاء واحد منخفض الرموز: الأقفال النشطة، الضغط الخلفي للطابور (queued/promoted/waiterOrphans/threshold)، وعدد المقترحات حسب الحالة. استخدم `fields` (["locks","queue","proposals"]) لتصغيره أكثر. للقراءة فقط.',
		th: 'รวบรวมสถานะปลั๊กอิน proposals ในการเรียกเดียวที่ใช้โทเค็นต่ำ: ล็อกที่ใช้งานอยู่ แรงดันย้อนของคิว (queued/promoted/waiterOrphans/threshold) และจำนวนข้อเสนอตามสถานะ ใช้ `fields` (["locks","queue","proposals"]) เพื่อลดขนาดลงอีก อ่านอย่างเดียว',
		vi: 'Tổng hợp trạng thái plugin proposals trong MỘT lần gọi ít token: các lock đang hoạt động, áp lực ngược của hàng đợi (queued/promoted/waiterOrphans/threshold) và số lượng đề xuất theo trạng thái. Dùng `fields` (["locks","queue","proposals"]) để thu nhỏ hơn nữa. Chỉ đọc.',
	},
};
