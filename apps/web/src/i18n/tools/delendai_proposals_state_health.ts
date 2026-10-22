// i18n catalogue for `delendai_proposals_state_health`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsStateHealthI18n: IToolI18n = {
	description: {
		en: 'Diagnose swarm state without changing anything: active write lanes, stale locks, livelocks, queue backpressure (waiterOrphans + threshold) and orphaned agent assignments. Returns { locks, stale, queue, registry, healthy }. Run state_repair to heal.',
		es: 'Diagnostica el estado del swarm sin cambiar nada: carriles de escritura activos, bloqueos obsoletos, livelocks, presión de la cola (waiterOrphans + umbral) y asignaciones de agentes huérfanas. Devuelve { locks, stale, queue, registry, healthy }. Ejecuta state_repair para sanearlo.',
		fr: "Diagnostique l'état du swarm sans rien modifier : voies d'écriture actives, verrous périmés, livelocks, pression de la file (waiterOrphans + seuil) et affectations d'agents orphelines. Renvoie { locks, stale, queue, registry, healthy }. Lancez state_repair pour réparer.",
		de: 'Diagnostiziert den Swarm-Zustand, ohne etwas zu ändern: aktive Schreibspuren, veraltete Sperren, Livelocks, Rückstau der Warteschlange (waiterOrphans + Schwelle) und verwaiste Agentenzuweisungen. Gibt { locks, stale, queue, registry, healthy } zurück. Mit state_repair beheben.',
		it: 'Diagnostica lo stato dello swarm senza cambiare nulla: corsie di scrittura attive, lock obsoleti, livelock, pressione della coda (waiterOrphans + soglia) e assegnazioni di agenti orfane. Restituisce { locks, stale, queue, registry, healthy }. Esegui state_repair per risanare.',
		pt: 'Diagnostica o estado do swarm sem alterar nada: faixas de escrita ativas, bloqueios obsoletos, livelocks, pressão da fila (waiterOrphans + limiar) e atribuições de agentes órfãs. Devolve { locks, stale, queue, registry, healthy }. Execute state_repair para sanar.',
		ja: '何も変更せずにスウォームの状態を診断します:アクティブな書き込みレーン、古いロック、ライブロック、キューのバックプレッシャー(waiterOrphans + しきい値)、孤立したエージェント割り当て。{ locks, stale, queue, registry, healthy } を返します。修復には state_repair を実行します。',
		zh: '在不改变任何内容的情况下诊断 swarm 状态:活跃的写入通道、过期锁、活锁、队列背压(waiterOrphans + 阈值)以及孤立的智能体分配。返回 { locks, stale, queue, registry, healthy }。运行 state_repair 进行修复。',
		hi: 'कुछ भी बदले बिना swarm की स्थिति का निदान करता है: सक्रिय लेखन लेन, पुराने लॉक, लाइवलॉक, क्यू का बैकप्रेशर (waiterOrphans + सीमा) और अनाथ एजेंट असाइनमेंट। { locks, stale, queue, registry, healthy } लौटाता है। सुधारने के लिए state_repair चलाएँ।',
		ar: 'يشخّص حالة السرب دون تغيير أي شيء: مسارات الكتابة النشطة، والأقفال القديمة، والأقفال الحية، وضغط القائمة (waiterOrphans + العتبة)، وتعيينات الوكلاء اليتيمة. يعيد { locks, stale, queue, registry, healthy }. شغّل state_repair للإصلاح.',
		th: 'วินิจฉัยสถานะของ swarm โดยไม่เปลี่ยนแปลงสิ่งใด: ช่องทางเขียนที่ใช้งานอยู่ ล็อกที่ค้าง ไลฟ์ล็อก แรงดันย้อนกลับของคิว (waiterOrphans + เกณฑ์) และการมอบหมายเอเจนต์ที่กำพร้า คืนค่า { locks, stale, queue, registry, healthy } เรียก state_repair เพื่อแก้ไข',
		vi: 'Chẩn đoán trạng thái swarm mà không thay đổi gì: các làn ghi đang hoạt động, khóa cũ, livelock, áp lực hàng đợi (waiterOrphans + ngưỡng) và các phân công tác tử mồ côi. Trả về { locks, stale, queue, registry, healthy }. Chạy state_repair để khắc phục.',
	},
};
