// i18n catalogue for `proposals_agent_lock_release_orphan`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsAgentLockReleaseOrphanI18n: IToolI18n = {
	description: {
		en: 'Release an orphan task lock only when a matching agent-dead event exists.',
		es: 'Libera un lock de tarea huérfano solo cuando existe un evento agent-dead coincidente.',
		fr: "Libère un verrou de tâche orpheline uniquement lorsqu'un événement agent-dead correspondant existe.",
		de: 'Gibt eine verwaiste Task-Sperre nur frei, wenn ein passendes agent-dead-Ereignis existiert.',
		it: 'Rilascia un lock di task orfano solo quando esiste un evento agent-dead corrispondente.',
		pt: 'Liberta um lock de tarefa órfão apenas quando existe um evento agent-dead correspondente.',
		ja: '一致する agent-dead イベントが存在する場合にのみ、孤立したタスクロックを解放します。',
		zh: '仅当存在匹配的 agent-dead 事件时,才释放孤立的任务锁。',
		hi: 'अनाथ टास्क लॉक को केवल तभी रिलीज़ करता है जब मिलान करने वाला agent-dead इवेंट मौजूद हो।',
		ar: 'يحرر قفل مهمة يتيمة (orphan) فقط عند وجود حدث agent-dead مطابق.',
		th: 'ปล่อยล็อกงานที่ไม่มีเจ้าของ (orphan) เฉพาะเมื่อมีเหตุการณ์ agent-dead ที่ตรงกันเท่านั้น',
		vi: 'Chỉ giải phóng lock của một task bị bỏ rơi (orphan) khi tồn tại một sự kiện agent-dead khớp với nó.',
	},
};
