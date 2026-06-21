// i18n catalogue for `proposals_state_repair`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsStateRepairI18n: IToolI18n = {
	description: {
		en: 'Auto-heal stale swarm state. mode:"dry-run" (default) reports what would be removed; mode:"execute" GCs stale locks, expires due queue entries and force-releases orphan assignments (atomic, mutex-guarded). Returns the diagnosis plus what was (or would be) removed.',
		es: 'Auto-repara el estado obsoleto del swarm. mode:"dry-run" (por defecto) informa de lo que se eliminaría; mode:"execute" hace GC de locks obsoletos, expira entradas de cola vencidas y libera por la fuerza asignaciones huérfanas (atómico, protegido por mutex). Devuelve el diagnóstico más lo que se eliminó (o eliminaría).',
		fr: 'Auto-répare l\'état obsolète du swarm. mode:"dry-run" (défaut) signale ce qui serait supprimé ; mode:"execute" effectue un GC des verrous obsolètes, expire les entrées de file échues et libère de force les affectations orphelines (atomique, protégé par mutex). Renvoie le diagnostic plus ce qui a été (ou serait) supprimé.',
		de: 'Heilt veralteten Swarm-Zustand automatisch. mode:"dry-run" (Standard) meldet, was entfernt würde; mode:"execute" führt GC für veraltete Sperren durch, lässt fällige Warteschlangeneinträge ablaufen und gibt verwaiste Zuweisungen zwangsweise frei (atomar, mutex-geschützt). Gibt die Diagnose plus das, was entfernt wurde (oder würde), zurück.',
		it: 'Auto-ripara lo stato obsoleto dello swarm. mode:"dry-run" (predefinito) riporta cosa verrebbe rimosso; mode:"execute" esegue il GC dei lock obsoleti, fa scadere le voci di coda dovute e rilascia forzatamente le assegnazioni orfane (atomico, protetto da mutex). Restituisce la diagnosi più ciò che è stato (o sarebbe) rimosso.',
		pt: 'Auto-repara o estado obsoleto do swarm. mode:"dry-run" (padrão) reporta o que seria removido; mode:"execute" faz GC de locks obsoletos, expira entradas de fila vencidas e força a libertação de atribuições órfãs (atómico, protegido por mutex). Devolve o diagnóstico mais o que foi (ou seria) removido.',
		ja: '古くなったスウォーム状態を自動的に修復します。mode:"dry-run"(デフォルト)は削除される内容を報告します;mode:"execute" は古いロックをGCし、期限切れのキューエントリを失効させ、孤立した割り当てを強制解放します(アトミック、ミューテックス保護)。診断結果と、削除された(または削除される予定の)内容を返します。',
		zh: '自动修复过期的群体(swarm)状态。mode:"dry-run"(默认)报告将被删除的内容;mode:"execute" 会对过期锁执行 GC、使到期的队列条目失效,并强制释放孤立的分配(原子操作,受互斥锁保护)。返回诊断结果以及已经(或将要)删除的内容。',
		hi: 'पुरानी स्वार्म स्थिति को स्वतः ठीक करता है। mode:"dry-run" (डिफ़ॉल्ट) रिपोर्ट करता है कि क्या हटाया जाएगा; mode:"execute" पुराने लॉक्स का GC करता है, समाप्त हो चुकी क्यू एंट्री को एक्सपायर करता है, और अनाथ असाइनमेंट्स को बलपूर्वक रिलीज़ करता है (परमाणु, म्यूटेक्स-सुरक्षित)। निदान के साथ-साथ जो हटाया गया (या हटाया जाएगा) वह लौटाता है।',
		ar: 'يصلح ذاتيًا حالة السرب (swarm) القديمة. mode:"dry-run" (الافتراضي) يُبلغ عن ما سيُحذف؛ mode:"execute" يجمع المهملات (GC) للأقفال القديمة، وينهي صلاحية إدخالات الطابور المستحقة، ويحرر بالقوة التعيينات اليتيمة (ذري، محمي بـ mutex). يُرجع التشخيص بالإضافة إلى ما تم (أو سيتم) حذفه.',
		th: 'ซ่อมแซมสถานะ swarm ที่ล้าสมัยโดยอัตโนมัติ mode:"dry-run" (ค่าเริ่มต้น) รายงานสิ่งที่จะถูกลบ mode:"execute" ทำ GC ล็อกที่ล้าสมัย ทำให้รายการคิวที่ครบกำหนดหมดอายุ และบังคับปล่อยการกำหนดที่ไม่มีเจ้าของ (อะตอมมิก ป้องกันด้วย mutex) ส่งคืนการวินิจฉัยพร้อมสิ่งที่ถูก (หรือจะถูก) ลบ',
		vi: 'Tự động khắc phục trạng thái swarm lỗi thời. mode:"dry-run" (mặc định) báo cáo những gì sẽ bị xóa; mode:"execute" thực hiện GC các lock lỗi thời, làm hết hạn các mục hàng đợi đã đến hạn và buộc giải phóng các phân công bị bỏ rơi (atomic, được bảo vệ bằng mutex). Trả về chẩn đoán cùng với những gì đã (hoặc sẽ) bị xóa.',
	},
};
