// i18n catalogue for `mcp-vertex_proposals_delegate`.

import type { IToolI18n } from '#I18N/tools/_shape';

export const proposalsDelegateI18n: IToolI18n = {
	description: {
		en: 'Delegate a slice to a subagent: assigns it a symbolic name (agent registry) and claims its files (agent lock) atomically, returning the handoff packet {agent, taskId, files, locked, instruction}. If the files are already locked it reports the conflict instead of claiming.',
		es: 'Delega un slice a un subagente: le asigna un nombre simbólico (registro de agentes) y reclama sus ficheros (lock de agente) de forma atómica, devolviendo el paquete de traspaso {agent, taskId, files, locked, instruction}. Si los ficheros ya están bloqueados, informa del conflicto en lugar de reclamar.',
		fr: "Délègue une tranche à un sous-agent : lui attribue un nom symbolique (registre d'agents) et revendique ses fichiers (verrou d'agent) de manière atomique, en renvoyant le paquet de transfert {agent, taskId, files, locked, instruction}. Si les fichiers sont déjà verrouillés, signale le conflit au lieu de revendiquer.",
		de: 'Delegiert eine Slice an einen Subagenten: weist ihr einen symbolischen Namen zu (Agentenregister) und beansprucht ihre Dateien (Agentensperre) atomar, wobei das Übergabepaket {agent, taskId, files, locked, instruction} zurückgegeben wird. Sind die Dateien bereits gesperrt, wird der Konflikt gemeldet, statt zu beanspruchen.',
		it: 'Delega una slice a un subagente: le assegna un nome simbolico (registro agenti) e rivendica i suoi file (lock agente) in modo atomico, restituendo il pacchetto di handoff {agent, taskId, files, locked, instruction}. Se i file sono già bloccati, segnala il conflitto invece di rivendicare.',
		pt: 'Delega uma slice a um subagente: atribui-lhe um nome simbólico (registo de agentes) e reivindica os seus ficheiros (lock de agente) de forma atómica, devolvendo o pacote de handoff {agent, taskId, files, locked, instruction}. Se os ficheiros já estiverem bloqueados, reporta o conflito em vez de reivindicar.',
		ja: 'スライスをサブエージェントに委任します:シンボリックな名前(エージェントレジストリ)を割り当て、そのファイル(エージェントロック)をアトミックにクレームし、ハンドオフパケット {agent, taskId, files, locked, instruction} を返します。ファイルが既にロックされている場合は、クレームの代わりに競合を報告します。',
		zh: '将切片委派给子代理:为其分配一个符号名称(代理注册表),并以原子方式声明其文件(代理锁),返回交接包 {agent, taskId, files, locked, instruction}。如果文件已被锁定,则报告冲突而不是声明。',
		hi: 'किसी स्लाइस को सबएजेंट को प्रत्यायोजित करता है: उसे एक प्रतीकात्मक नाम (एजेंट रजिस्ट्री) देता है और परमाणु रूप से उसकी फ़ाइलों का (एजेंट लॉक) क्लेम करता है, हैंडऑफ पैकेट {agent, taskId, files, locked, instruction} लौटाते हुए। यदि फ़ाइलें पहले से लॉक हैं, तो यह क्लेम करने के बजाय टकराव की रिपोर्ट करता है।',
		ar: 'يفوّض شريحة إلى وكيل فرعي: يخصص له اسمًا رمزيًا (سجل الوكلاء) ويطالب بملفاته (قفل الوكيل) بشكل ذري، ويُرجع حزمة التسليم {agent, taskId, files, locked, instruction}. إذا كانت الملفات مقفلة بالفعل، يُبلغ عن التعارض بدلاً من المطالبة.',
		th: 'มอบหมายสไลซ์ให้กับซับเอเจนต์: กำหนดชื่อสัญลักษณ์ (รีจิสทรีเอเจนต์) และเรียกร้องไฟล์ของมัน (ล็อกเอเจนต์) แบบอะตอมมิก ส่งคืนแพ็กเก็ตส่งต่อ {agent, taskId, files, locked, instruction} หากไฟล์ถูกล็อกอยู่แล้ว จะรายงานความขัดแย้งแทนการเรียกร้อง',
		vi: 'Giao một lát cho subagent: gán cho nó một tên tượng trưng (registry agent) và claim các tệp của nó (lock agent) một cách atomic, trả về gói chuyển giao {agent, taskId, files, locked, instruction}. Nếu các tệp đã bị lock, nó sẽ báo cáo xung đột thay vì claim.',
	},
};
