// i18n catalogue for `delendai_orchestrator-runner_get_quota`.
//
// Per-tool i18n entry. The 12-lang invariant is enforced by `check-i18n.ts`
// once the entry opts in via `apps/web/src/i18n/tools/index.ts` (S9 wiring).

import type { IToolI18n } from '#I18N/tools/_shape';

export const orchestratorRunnerGetQuotaI18n: IToolI18n = {
	description: {
		en: 'Read the recorded per-provider quota snapshot (limits, usage and reset times per window). The snapshot is written by the bootstrap/quota layer in a later slice; until then this returns {present:false} with an empty roster and a note, never an error — a quota miss must not break routing.',
		es: 'Lee la instantánea registrada de cuotas por proveedor (límites, uso y hora de reinicio por ventana). La instantánea la escribe la capa de arranque/cuotas en un slice posterior; hasta entonces devuelve {present:false} con un roster vacío y una nota, nunca un error: que falte la cuota no debe romper el enrutamiento.',
		fr: "Lit l'instantané enregistré des quotas par fournisseur (limites, consommation et heures de réinitialisation par fenêtre). L'instantané est écrit par la couche d'amorçage/quotas dans un slice ultérieur ; d'ici là, renvoie {present:false} avec un roster vide et une note, jamais une erreur — un quota absent ne doit pas casser le routage.",
		de: 'Liest den erfassten Kontingent-Schnappschuss je Anbieter (Grenzen, Verbrauch und Rücksetzzeiten je Fenster). Der Schnappschuss wird in einem späteren Slice von der Einrichtungs-/Kontingentschicht geschrieben; bis dahin liefert dies {present:false} mit leerer Roster und einem Hinweis, nie einen Fehler – ein fehlendes Kontingent darf das Routing nicht brechen.',
		it: "Legge l'istantanea registrata delle quote per provider (limiti, utilizzo e orari di azzeramento per finestra). L'istantanea viene scritta dal livello di avvio/quote in uno slice successivo; fino ad allora restituisce {present:false} con un roster vuoto e una nota, mai un errore — una quota mancante non deve rompere l'instradamento.",
		pt: 'Lê o instantâneo registado de quotas por fornecedor (limites, uso e horas de reposição por janela). O instantâneo é escrito pela camada de arranque/quotas num slice posterior; até lá devolve {present:false} com um roster vazio e uma nota, nunca um erro — uma quota em falta não pode partir o encaminhamento.',
		ja: '記録されたプロバイダーごとのクォータのスナップショット(ウィンドウごとの上限、使用量、リセット時刻)を読み取ります。スナップショットは後続のスライスでブートストラップ/クォータ層が書き込みます。それまでは、エラーではなく空のロスターと注記付きの {present:false} を返します。クォータが無くてもルーティングを壊してはならないためです。',
		zh: '读取已记录的各提供方配额快照(每个时间窗口的上限、用量和重置时间)。该快照由后续切片中的初始化/配额层写入;在此之前返回带空名册和说明的 {present:false},而不是错误——缺少配额不能破坏路由。',
		hi: 'हर प्रदाता का दर्ज कोटा स्नैपशॉट पढ़ता है (हर अवधि की सीमाएँ, उपयोग और रीसेट समय)। स्नैपशॉट बाद के किसी स्लाइस में बूटस्ट्रैप/कोटा परत लिखती है; तब तक यह त्रुटि नहीं, बल्कि ख़ाली रोस्टर और एक टिप्पणी के साथ {present:false} लौटाता है — कोटा न मिलने से रूटिंग नहीं टूटनी चाहिए।',
		ar: 'يقرأ لقطة الحصص المسجلة لكل مزوّد (الحدود والاستهلاك وأوقات إعادة الضبط لكل نافذة). تكتب طبقة التهيئة/الحصص هذه اللقطة في شريحة لاحقة؛ وحتى ذلك الحين يعيد {present:false} مع قائمة فارغة وملاحظة، لا خطأً أبدًا — فغياب الحصة يجب ألا يكسر التوجيه.',
		th: 'อ่านสแนปช็อตโควตาที่บันทึกไว้ของแต่ละผู้ให้บริการ (ขีดจำกัด การใช้ และเวลารีเซ็ตต่อช่วงเวลา) สแนปช็อตนี้จะถูกเขียนโดยชั้นเริ่มต้น/โควตาใน slice ภายหลัง ระหว่างนี้จะคืน {present:false} พร้อมโรสเตอร์ว่างและหมายเหตุ ไม่ใช่ข้อผิดพลาด เพราะการไม่มีโควตาต้องไม่ทำให้การกำหนดเส้นทางพัง',
		vi: 'Đọc ảnh chụp hạn ngạch đã ghi của từng nhà cung cấp (giới hạn, mức dùng và thời điểm đặt lại theo từng khung). Ảnh chụp do lớp khởi tạo/hạn ngạch ghi ở một slice sau; cho đến lúc đó trả về {present:false} kèm roster rỗng và một ghi chú, không bao giờ là lỗi — thiếu hạn ngạch không được làm hỏng định tuyến.',
	},
};
