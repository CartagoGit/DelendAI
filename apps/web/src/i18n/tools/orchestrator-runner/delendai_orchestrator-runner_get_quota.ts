// i18n catalogue for `delendai_orchestrator-runner_get_quota`.
//
// Per-tool i18n entry. The 12-lang invariant is enforced by `check-i18n.ts`
// once the entry opts in via `apps/web/src/i18n/tools/index.ts` (S9 wiring).

import type { IToolI18n } from '#I18N/tools/_shape';

export const orchestratorRunnerGetQuotaI18n: IToolI18n = {
	description: {
		en: 'Read the recorded per-provider quota snapshot (limits, usage and reset times per window). The snapshot is written by the bootstrap/quota layer in a later slice; until then this returns {present:false} with an empty roster and a note, never an error — a quota miss must not break routing. Read-only.',
		es: 'Lee la instantánea de cuota registrada por proveedor (límites, uso y horas de reinicio por ventana). La instantánea la escribe la capa de bootstrap/cuota en un segmento posterior; hasta entonces devuelve {present:false} con una lista vacía y una nota, nunca un error: un fallo de cuota no debe romper el enrutamiento. Solo lectura.',
		fr: "Lit l'instantané de quota enregistré par fournisseur (limites, utilisation et heures de réinitialisation par fenêtre). L'instantané est écrit par la couche bootstrap/quota dans une tranche ultérieure ; en attendant, ceci renvoie {present:false} avec une liste vide et une note, jamais une erreur — un quota manquant ne doit pas casser le routage. Lecture seule.",
		de: 'Liest den aufgezeichneten Kontingent-Snapshot pro Anbieter (Limits, Nutzung und Reset-Zeiten pro Fenster). Der Snapshot wird von der Bootstrap-/Kontingent-Schicht in einem späteren Slice geschrieben; bis dahin gibt dies {present:false} mit leerer Liste und einem Hinweis zurück, niemals einen Fehler — ein fehlendes Kontingent darf das Routing nicht brechen. Nur lesend.',
		it: "Legge lo snapshot di quota registrato per provider (limiti, utilizzo e orari di reset per finestra). Lo snapshot è scritto dal livello bootstrap/quota in uno slice successivo; fino ad allora restituisce {present:false} con un elenco vuoto e una nota, mai un errore — una quota mancante non deve rompere l'instradamento. Sola lettura.",
		pt: 'Lê o instantâneo de quota registado por fornecedor (limites, uso e horas de reposição por janela). O instantâneo é escrito pela camada de bootstrap/quota numa fatia posterior; até lá devolve {present:false} com uma lista vazia e uma nota, nunca um erro — uma falha de quota não deve quebrar o encaminhamento. Só de leitura.',
		ja: '記録されたプロバイダーごとのクォータスナップショット(ウィンドウごとの上限・使用量・リセット時刻)を読み取ります。スナップショットは後続スライスのブートストラップ/クォータ層が書き込みます。それまでは空のロスターと注記付きの {present:false} を返し、エラーは返しません——クォータの欠落でルーティングを壊してはなりません。読み取り専用。',
		zh: '读取记录的每个提供方的配额快照(每个窗口的限额、用量和重置时间)。该快照由后续切片中的引导/配额层写入;在此之前返回带空名单和一条备注的 {present:false},绝不返回错误——配额缺失不得中断路由。只读。',
		hi: 'प्रति-प्रदाता दर्ज कोटा स्नैपशॉट पढ़ता है (प्रति विंडो सीमाएँ, उपयोग और रीसेट समय)। स्नैपशॉट बाद के स्लाइस में बूटस्ट्रैप/कोटा परत द्वारा लिखा जाता है; तब तक यह खाली सूची और एक नोट के साथ {present:false} लौटाता है, कभी त्रुटि नहीं — कोटा न मिलने से रूटिंग नहीं टूटनी चाहिए। केवल पढ़ने के लिए।',
		ar: 'يقرأ لقطة الحصة المُسجَّلة لكل مزوّد (الحدود والاستخدام وأوقات إعادة التعيين لكل نافذة). تُكتب اللقطة بواسطة طبقة التهيئة/الحصة في شريحة لاحقة؛ وحتى ذلك الحين يعيد {present:false} بقائمة فارغة وملاحظة، ولا يعيد خطأً أبدًا — فغياب الحصة يجب ألا يكسر التوجيه. للقراءة فقط.',
		th: 'อ่านสแนปช็อตโควตาต่อผู้ให้บริการที่บันทึกไว้ (ขีดจำกัด การใช้งาน และเวลารีเซ็ตต่อหน้าต่าง) สแนปช็อตถูกเขียนโดยเลเยอร์ bootstrap/quota ในสไลซ์ถัดไป; จนกว่าจะถึงตอนนั้นจะคืนค่า {present:false} พร้อมรายชื่อว่างและหมายเหตุ ไม่เคยเป็นข้อผิดพลาด — โควตาที่ขาดหายต้องไม่ทำให้การกำหนดเส้นทางเสียหาย อ่านอย่างเดียว',
		vi: 'Đọc ảnh chụp hạn ngạch đã ghi theo từng nhà cung cấp (giới hạn, mức dùng và thời gian đặt lại theo cửa sổ). Ảnh chụp được ghi bởi lớp bootstrap/hạn ngạch trong một lát cắt sau; cho đến lúc đó, nó trả về {present:false} với danh sách rỗng và một ghi chú, không bao giờ là lỗi — thiếu hạn ngạch không được làm hỏng việc định tuyến. Chỉ đọc.',
	},
};
