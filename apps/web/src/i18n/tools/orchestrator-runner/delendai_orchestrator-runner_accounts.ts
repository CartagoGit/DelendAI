// i18n catalogue for `delendai_orchestrator-runner_accounts`.
//
// Per-tool i18n entry. The 12-lang invariant is enforced by `check-i18n.ts`
// once the entry opts in via `apps/web/src/i18n/tools/index.ts` (S9 wiring).

import type { IToolI18n } from '#I18N/tools/_shape';

export const orchestratorRunnerAccountsI18n: IToolI18n = {
	description: {
		en: 'List the accounts declared in delendai.config.json#accounts: credential and billing mode, whether the client runs in an isolated profile, whether unattended work may use it, each quota group with the invocations holding it now (null when the ledger is unreadable) and the last hop the journal records. Never a secret. Read-only.',
		es: 'Lista las cuentas declaradas en delendai.config.json#accounts: modo de credencial y de facturación, si el cliente se ejecuta en un perfil aislado, si el trabajo desatendido puede usarla, cada grupo de cuota con las invocaciones que lo ocupan ahora (null si el registro no se puede leer) y el último salto que registra el diario. Nunca un secreto. Solo lectura.',
		fr: "Liste les comptes déclarés dans delendai.config.json#accounts : mode d'identifiant et de facturation, si le client s'exécute dans un profil isolé, si le travail non surveillé peut l'utiliser, chaque groupe de quota avec les invocations qui l'occupent (null si le registre est illisible) et le dernier saut consigné dans le journal. Jamais de secret. Lecture seule.",
		de: 'Listet die in delendai.config.json#accounts deklarierten Konten: Anmelde- und Abrechnungsmodus, ob der Client in einem isolierten Profil läuft, ob unbeaufsichtigte Arbeit es nutzen darf, jede Kontingentgruppe mit den Aufrufen, die sie gerade belegen (null, wenn das Register unlesbar ist), und den letzten im Journal erfassten Schritt. Niemals ein Geheimnis. Nur lesend.',
		it: "Elenca gli account dichiarati in delendai.config.json#accounts: modalità di credenziale e di fatturazione, se il client gira in un profilo isolato, se il lavoro non presidiato può usarlo, ogni gruppo di quota con le invocazioni che lo occupano ora (null se il registro è illeggibile) e l'ultimo passo registrato nel diario. Mai un segreto. Sola lettura.",
		pt: 'Lista as contas declaradas em delendai.config.json#accounts: modo de credencial e de faturação, se o cliente corre num perfil isolado, se o trabalho não assistido a pode usar, cada grupo de quota com as invocações que o ocupam agora (null se o registo não puder ser lido) e o último passo registado no diário. Nunca um segredo. Só de leitura.',
		ja: 'delendai.config.json#accounts で宣言されたアカウントを一覧表示します:認証情報と課金のモード、クライアントが分離されたプロファイルで動くか、無人作業で使えるか、各クォータグループとそれを現在占有している呼び出し(台帳が読めない場合は null)、ジャーナルに記録された最後の実行。秘密情報は含みません。読み取り専用。',
		zh: '列出 delendai.config.json#accounts 中声明的账户:凭据与计费模式、客户端是否在隔离的配置目录中运行、无人值守的工作能否使用、每个配额组及当前占用它的调用(账本不可读时为 null),以及日志记录的最后一次调用。从不包含机密。只读。',
		hi: 'delendai.config.json#accounts में घोषित खातों की सूची: क्रेडेंशियल और बिलिंग मोड, क्या क्लाइंट अलग प्रोफ़ाइल में चलता है, क्या बिना निगरानी का काम इसका उपयोग कर सकता है, हर कोटा समूह और उसे अभी घेरने वाले आह्वान (लेखा न पढ़ा जा सके तो null), और जर्नल में दर्ज अंतिम चरण। कभी कोई रहस्य नहीं। केवल पढ़ने के लिए।',
		ar: 'يسرد الحسابات المعلنة في delendai.config.json#accounts: وضع الاعتماد والفوترة، وما إذا كان العميل يعمل في ملف تعريف معزول، وما إذا كان العمل غير المراقب يمكنه استخدامه، وكل مجموعة حصة مع الاستدعاءات التي تشغلها الآن (null إذا تعذرت قراءة السجل)، وآخر خطوة سجّلها الدفتر. لا يتضمن أي سر. للقراءة فقط.',
		th: 'แสดงรายการบัญชีที่ประกาศใน delendai.config.json#accounts: โหมดข้อมูลรับรองและการเรียกเก็บเงิน ไคลเอนต์ทำงานในโปรไฟล์แยกหรือไม่ งานที่ไม่มีผู้ดูแลใช้ได้หรือไม่ แต่ละกลุ่มโควตาพร้อมการเรียกใช้ที่ครองอยู่ตอนนี้ (null เมื่ออ่านบัญชีแยกประเภทไม่ได้) และขั้นตอนล่าสุดที่บันทึกไว้ ไม่มีความลับใดๆ อ่านอย่างเดียว',
		vi: 'Liệt kê các tài khoản khai báo trong delendai.config.json#accounts: chế độ thông tin xác thực và tính phí, máy khách có chạy trong hồ sơ cô lập không, công việc không giám sát có được dùng không, từng nhóm hạn ngạch cùng các lần gọi đang chiếm nó (null khi không đọc được sổ) và bước cuối cùng nhật ký ghi lại. Không bao giờ chứa bí mật. Chỉ đọc.',
	},
};
