// i18n catalogue for `proposals_agent_worktree`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsAgentWorktreeI18n: IToolI18n = {
	description: {
		en: 'Create, list or remove a per-agent git worktree (branch `agent/<name>`) so concurrent agents never share `.git/index`. `create` is idempotent (returns the existing worktree if one is already there). `remove` refuses on uncommitted changes unless `force`.',
		es: 'Crea, lista o elimina un git worktree por agente (rama `agent/<name>`) para que los agentes concurrentes nunca compartan `.git/index`. `create` es idempotente (devuelve el worktree existente si ya hay uno). `remove` rechaza si hay cambios sin commitear a menos que se use `force`.',
		fr: "Crée, liste ou supprime un worktree git par agent (branche `agent/<name>`) afin que les agents concurrents ne partagent jamais `.git/index`. `create` est idempotent (renvoie le worktree existant s'il y en a déjà un). `remove` refuse en cas de changements non commités sauf si `force`.",
		de: 'Erstellt, listet oder entfernt einen Git-Worktree pro Agent (Branch `agent/<name>`), damit gleichzeitige Agenten niemals `.git/index` teilen. `create` ist idempotent (gibt den vorhandenen Worktree zurück, falls bereits einer existiert). `remove` verweigert bei nicht committeten Änderungen, sofern nicht `force` gesetzt ist.',
		it: 'Crea, elenca o rimuove un git worktree per agente (branch `agent/<name>`) così gli agenti concorrenti non condividono mai `.git/index`. `create` è idempotente (restituisce il worktree esistente se già presente). `remove` si rifiuta in presenza di modifiche non committate a meno che non si usi `force`.',
		pt: 'Cria, lista ou remove um worktree git por agente (branch `agent/<name>`) para que agentes concorrentes nunca partilhem `.git/index`. `create` é idempotente (devolve o worktree existente se já houver um). `remove` recusa-se com alterações não comitadas a menos que `force` seja usado.',
		ja: 'エージェントごとに git worktree(ブランチ `agent/<name>`)を作成、一覧表示、または削除し、並行するエージェントが `.git/index` を共有しないようにします。`create` は冪等です(既に worktree が存在する場合はそれを返します)。`remove` はコミットされていない変更がある場合、`force` を指定しない限り拒否します。',
		zh: '为每个代理创建、列出或移除一个 git worktree(分支 `agent/<name>`),使并发代理永不共享 `.git/index`。`create` 是幂等的(若已存在则返回现有的 worktree)。除非指定 `force`,否则 `remove` 在存在未提交更改时会拒绝执行。',
		hi: 'प्रति-एजेंट git worktree (ब्रांच `agent/<name>`) बनाता है, सूचीबद्ध करता है, या हटाता है ताकि समवर्ती एजेंट्स कभी `.git/index` साझा न करें। `create` इडमपोटेंट है (यदि पहले से कोई worktree मौजूद है तो उसे लौटाता है)। `remove` अनकमिटेड बदलावों पर अस्वीकार करता है जब तक कि `force` न हो।',
		ar: 'يُنشئ أو يسرد أو يحذف worktree في git لكل وكيل (الفرع `agent/<name>`) حتى لا يتشارك الوكلاء المتزامنون أبدًا في `.git/index`. عملية `create` متكررة الأثر (idempotent) (تُرجع الـ worktree الموجود إذا كان موجودًا بالفعل). يرفض `remove` عند وجود تغييرات غير ملتزمة إلا إذا استُخدم `force`.',
		th: 'สร้าง แสดงรายการ หรือลบ git worktree ต่อเอเจนต์ (แบรนช์ `agent/<name>`) เพื่อให้เอเจนต์ที่ทำงานพร้อมกันไม่ใช้ `.git/index` ร่วมกัน `create` เป็น idempotent (ส่งคืน worktree ที่มีอยู่แล้วถ้ามี) `remove` จะปฏิเสธหากมีการเปลี่ยนแปลงที่ยังไม่ commit เว้นแต่ใช้ `force`',
		vi: 'Tạo, liệt kê hoặc xóa một git worktree theo từng agent (nhánh `agent/<name>`) để các agent đồng thời không bao giờ chia sẻ `.git/index`. `create` là idempotent (trả về worktree đã có sẵn nếu đã tồn tại). `remove` sẽ từ chối nếu có thay đổi chưa commit trừ khi dùng `force`.',
	},
};
