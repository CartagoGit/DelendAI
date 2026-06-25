// i18n catalogue for `mcp-vertex_proposals_state_health`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsStateHealthI18n: IToolI18n = {
	description: {
		en: 'Diagnose swarm state without changing anything: active write lanes, queue backpressure (waiterOrphans + threshold) and orphaned agent assignments. Returns { locks, queue, registry, healthy }. Run state_repair to heal.',
		es: 'Diagnostica el estado del swarm sin cambiar nada: carriles de escritura activos, backpressure de la cola (waiterOrphans + threshold) y asignaciones de agente huérfanas. Devuelve { locks, queue, registry, healthy }. Ejecuta state_repair para repararlo.',
		fr: "Diagnostique l'état du swarm sans rien modifier : voies d'écriture actives, contre-pression de file (waiterOrphans + threshold) et affectations d'agents orphelines. Renvoie { locks, queue, registry, healthy }. Exécutez state_repair pour réparer.",
		de: 'Diagnostiziert den Swarm-Zustand, ohne etwas zu ändern: aktive Schreibspuren, Warteschlangen-Gegendruck (waiterOrphans + threshold) und verwaiste Agentenzuweisungen. Gibt { locks, queue, registry, healthy } zurück. Führe state_repair aus, um zu heilen.',
		it: 'Diagnostica lo stato dello swarm senza modificare nulla: corsie di scrittura attive, backpressure della coda (waiterOrphans + threshold) e assegnazioni agente orfane. Restituisce { locks, queue, registry, healthy }. Esegui state_repair per ripararlo.',
		pt: 'Diagnostica o estado do swarm sem alterar nada: faixas de escrita ativas, contrapressão da fila (waiterOrphans + threshold) e atribuições de agente órfãs. Devolve { locks, queue, registry, healthy }. Executa state_repair para reparar.',
		ja: '何も変更せずにスウォームの状態を診断します:アクティブな書き込みレーン、キューのバックプレッシャー(waiterOrphans + threshold)、孤立したエージェント割り当て。{ locks, queue, registry, healthy } を返します。修復するには state_repair を実行してください。',
		zh: '在不更改任何内容的情况下诊断群体(swarm)状态:活动写入通道、队列反压(waiterOrphans + threshold)以及孤立的代理分配。返回 { locks, queue, registry, healthy }。运行 state_repair 进行修复。',
		hi: 'कुछ भी बदले बिना स्वार्म स्थिति का निदान करता है: एक्टिव राइट लेन, क्यू बैकप्रेशर (waiterOrphans + threshold), और अनाथ एजेंट असाइनमेंट्स। { locks, queue, registry, healthy } लौटाता है। ठीक करने के लिए state_repair चलाएँ।',
		ar: 'يشخّص حالة السرب (swarm) دون تغيير أي شيء: مسارات الكتابة النشطة، الضغط الخلفي للطابور (waiterOrphans + threshold)، وتعيينات الوكلاء اليتيمة. يُرجع { locks, queue, registry, healthy }. شغّل state_repair للإصلاح.',
		th: 'วินิจฉัยสถานะ swarm โดยไม่เปลี่ยนแปลงสิ่งใด: เลนการเขียนที่ใช้งานอยู่ แรงดันย้อนของคิว (waiterOrphans + threshold) และการกำหนดเอเจนต์ที่ไม่มีเจ้าของ ส่งคืน { locks, queue, registry, healthy } รัน state_repair เพื่อซ่อมแซม',
		vi: 'Chẩn đoán trạng thái swarm mà không thay đổi gì: các lane ghi đang hoạt động, áp lực ngược hàng đợi (waiterOrphans + threshold) và các phân công agent bị bỏ rơi. Trả về { locks, queue, registry, healthy }. Chạy state_repair để khắc phục.',
	},
};
