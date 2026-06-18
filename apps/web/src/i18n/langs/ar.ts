import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "المفهوم",
	"nav.install": "التثبيت",
	"nav.tools": "الأدوات",
	"nav.benchmarks": "القياسات",
	"nav.plugins": "الإضافات",
	"nav.github": "GitHub",
	"hero.title.a": "",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": " المحايد للمشروع",
	"hero.subheader": "نواة خادم MCP + مُحمّل إضافات لأي مشروع.",
	"hero.tagline":
		"نواة خادم Model Context Protocol محايدة للمشروع. النواة لا تعرف شيئًا عن مجالك — تأتي القدرات كإضافات تُحمّلها عند الطلب، وكلها مُقاسة لتكلفة منخفضة من الـ tokens.",
	"hero.ctaInstall": "ابدأ الآن",
	"hero.ctaTools": "تصفّح الأدوات",
	"hero.runsOn": "يعمل على Node و Deno و bun · أي مدير حزم",
	"marquee.runtimes": "مبني بـ · يعمل على",
	"marquee.clients": "عملاء MCP والنماذج",
	"concept.title": "نواة صغيرة، إضافات كثيرة",
	"concept.body":
		"mcp-vertex هي النواة المُحكمة: تسجيل أدوات حتمي، مسارات workspace محقونة، مُحمّل إضافات عبر CLI، وسطح أدوات مُقاس بالـ tokens. كل ما هو خاص بالمجال هو إضافة — حمّل ما تحتاجه فقط، تحت أي مضيف أو نموذج.",
	"concept.f1.t": "محايد للمشروع",
	"concept.f1.b":
		"لا كود مجال في النواة. الإضافة نفسها تتصرف بشكل متطابق تحت أي مضيف أو نموذج.",
	"concept.f2.t": "قليل الـ tokens بالتصميم",
	"concept.f2.b":
		"overview واحد، معرفة كسولة، وJSON مُدمج. ميزانية مُقاسة تحمي من التراجع في الـ CI.",
	"concept.f3.t": "تزامن آمن",
	"concept.f3.b":
		"كتابات ذرّية، وقفل متبادل عبر العمليات برموز ملكية، وحجر صحي للتلف.",
	"concept.f4.t": "جاهز لتعدد الوكلاء",
	"concept.f4.b":
		"إضافة proposals تنسّق سربًا: أقفال، طابور مهام، انفصال الشرائح، وإشعارات دفع.",
	"install.title": "التثبيت والتشغيل",
	"install.lead": "أضفها ووجّه عميل MCP لديك إلى ثنائي mcp-vertex:",
	"install.verify": "تحقّق من أنه يعمل",
	"install.addto": "أضِفه إلى IDE / الوكيل",
	"install.presets": "إعدادات مسبقة:",
	"install.oneCmd": "أمر واحد · أي IDE",
	"install.oneCmdNote": "يكتشف الـ IDE ويضيف mcp-vertex — دون المساس بخوادم MCP الأخرى لديك.",
	"install.config":
		"اختر إعدادًا مسبقًا (minimal · standard · swarm) أو اسرد الإضافات صراحةً. شغّل مع --check للتشخيص الذاتي.",
	"tools.title": "الأدوات",
	"tools.lead":
		"كل أداة تعرضها مجموعة الإضافات الكاملة، مُجمّعة حسب النطاق — مُستخرجة من السجل الحي، لذا لا تنحرف هذه الصفحة عن الكود أبدًا.",
	"tools.count": "أداة",
	"tools.packages": "حزمة",
	"bench.title": "مُقاس، لا مُدّعى",
	"bench.lead":
		"كفاءة الـ tokens ثابتة محمية — يفشل اختبار CI إذا تراجعت هذه الحدود.",
	"bench.b1.t": "بدء بارد",
	"bench.b1.b":
		"overview (مُدمج) + auto_work — توجيه كامل بأقل من 300 token.",
	"bench.b2.t": "بلا استطلاع",
	"bench.b2.b":
		"تحرير القفل يُدفع (إضافة notification)، لا يُستطلع في حلقة.",
	"bench.b3.t": "محمي من الانحراف",
	"bench.b3.b":
		"SDK أنواع مُولّد، وميزانيات tokens، وشبكة e2e صارمة على البروتوكول الحقيقي.",
	"bench.live.title": "تكلفة التوجيه · مُقاسة حيًّا",
	"bench.live.note":
		"عدد الـ tokens لنص النتيجة الذي يراه الوكيل (≈4 بايت/token)، مُقاس حيًّا عبر البروتوكول مع proposals+memory. خط الأساس تقدير توضيحي للتوجّه يدويًا — ليس قياسًا لأداة طرف ثالث.",
	"bench.baseline": "بدون mcp-vertex (يدويًا · تقدير)",
	"plugins.title": "الإضافات",
	"plugins.lead": "الحزم المنشورة. حمّل ما تحتاجه فقط؛ تبقى النواة صغيرة.",
	"cfg.title": "الإعدادات",
	"cfg.theme": "السمة",
	"cfg.language": "اللغة",
	"cfg.motion": "الحركة",
	"cfg.motionLabel": "تحريك الأشرطة",
	"footer.built": "مُولّد من السجل الحي للأدوات.",
	"pluginpage.back": "رجوع",
	"pluginpage.tools": "الأدوات",
	"pluginpage.install": "التثبيت",
	"plugin.proposals":
		"تنسيق متعدد الوكلاء: أقفال، طابور مهام، شرائح، round-context، إصلاح الحالة.",
	"plugin.git": "فحص مستودع للقراءة فقط: status، الملفات المتغيرة، diff، log.",
	"plugin.memory":
		"ملاحظات دائمة عبر الجلسات مع استرجاع BM25، حصص، TTL، وإخفاء الأسرار.",
	"plugin.search":
		"بحث منخفض التكلفة في الـ workspace: سلسلة فرعية أو regex، تضمين/استبعاد glob.",
	"plugin.rules": "كشف إطار العمل + إرشاد lint/الأعراف؛ إعداد المشروع له الأولوية.",
	"plugin.quality": "تشغيل بوابات الجودة (lint/test/build) بسياسة سماح/منع؛ قابل للإلغاء.",
	"plugin.docs": "فهرسة وقراءة وثائق markdown للمشروع، تنقّل مُنسّق منخفض التكلفة.",
	"plugin.deps": "جرد تبعيات دون اتصال + صحة (lockfile، نطاقات فضفاضة، تكرارات).",
	"plugin.notification": "يدفع أحداث تحرير القفل ليتوقف الوكلاء عن الاستطلاع.",
	"plugin.core": "النواة المحايدة: overview، scaffold، مقاييس، doctor، ومُحمّل الإضافات.",
};

export default dict;
export { dict };