# 📋 خطة بناء نظام إدارة العلوة (Wholesale Produce M# 📋 خطة بناء نظام إدارة العلوة (Wholesale Produce Market Management System)

> تطبيق سطح مكتب يعمل بدون إنترنت بالكامل (Offline-first) على جهاز واحد،
> لإدارة العمليات المالية والتشغيلية لسوق جملة للخضار والفواكه.

---

## 0. التقنيات المعتمدة (Tech Stack)

| الطبقة | التقنية |
|---|---|
| Shell | Tauri 2 |
| الواجهة الأمامية | React 19 + Vite 8 |
| قاعدة البيانات | SQLite (محلية) |
| الربط بقاعدة البيانات | tauri-plugin-sql |
| Migrations | ملفات `.sql` مرقّمة في `src-tauri/migrations/` |
| الواجهة | shadcn/ui (نمط base-nova) + Tailwind CSS 4 |
| الأيقونات | lucide-react |
| التوجيه (Routing) | react-router (يُضاف) |
| الرسوم البيانية | recharts (يُضاف لصفحة التحليلات) |

> ⚠️ لا Supabase، لا RLS، لا مصادقة سحابية، لا مزامنة في النسخة الحالية.

---

## وضع المشروع الحالي

| العنصر | الحالة | الإجراء المطلوب |
|---|---|---|
| Tauri + React + Vite | ✅ جاهز | — |
| `tauri-plugin-sql` | ❌ غير مثبّت | إضافته (Rust + JS) |
| نظام Migrations | ❌ غير موجود | إنشاء مجلد `migrations/` وربطه |
| إعداد RTL / العربية | ❌ غير موجود | `dir="rtl"` + خط عربي + خصائص Tailwind المنطقية |
| `components.json` (rtl) | ⚠️ `false` | تغييره إلى `true` |
| مكونات shadcn | ⚠️ فقط `button` | إضافة: table, dialog, combobox, input, select... |
| التوجيه (Routing) | ❌ غير موجود | إضافة react-router + Layout جانبي |
| النسخ الاحتياطي / الطباعة | ❌ غير موجود | plugins: dialog + fs، وقالب طباعة |
| صفحة التحليلات | ❌ غير موجودة | لوحة معلومات + رسوم بيانية |

---

## المرحلة 0: تجهيز البنية التحتية (Foundation) — 🔴 حرجة

### 0.1 تفعيل العربية و RTL
- تعديل `components.json` → `"rtl": true`.
- تعديل `index.html` → `<html lang="ar" dir="rtl">`.
- اعتماد خط عربي واضح (مثل Cairo أو IBM Plex Sans Arabic) للنصوص والأرقام.
- استخدام خصائص Tailwind المنطقية (`ms-*`/`me-*`/`ps-*`/`pe-*`) بدل (`ml-*`/`mr-*`).

### 0.2 تثبيت `tauri-plugin-sql` + Migrations
- **Rust (`src-tauri/Cargo.toml`):**
  ```toml
  tauri-plugin-sql = { version = "2", features = ["sqlite"] }
  ```
- **JS:**
  ```bash
  npm install @tauri-apps/plugin-sql
  ```
- ربط الـ Migrations داخل `lib.rs` عبر `Builder::new().add_migrations(...)` وتسجيل الـ plugin.
- تحديث `capabilities/default.json` بأذونات `sql:default`.

### 0.3 إضافة plugins النسخ الاحتياطي والطباعة
```bash
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```
- إضافتها كذلك في `Cargo.toml` و `capabilities/default.json`.

### 0.4 التوجيه والتخطيط العام (Routing & Layout)
```bash
npm install react-router
```
- بناء `AppLayout`: قائمة جانبية (Sidebar) عربية + منطقة محتوى.
- صفحات: لوحة المعلومات، التجار، المركبات/السائقون، العمال، القوائم، السلال، الأجور، سجل المعاملات، التقارير، الإعدادات/النسخ الاحتياطي.

**مخرجات المرحلة:** RTL يعمل + اتصال SQLite + أول migration يُنفّذ تلقائيًا + هيكل تنقّل كامل.

---

## المرحلة 1: قاعدة البيانات (Schema & Migrations) — 🔴 حرجة

### مبادئ التصميم (إلزامية)
| المبدأ | السبب |
|---|---|
| مفاتيح أساسية UUID (لا AUTOINCREMENT) | مزامنة مستقبلية بدون تعارض IDs |
| `created_at` / `updated_at` في كل جدول | تتبع التغييرات والمزامنة المستقبلية |
| حذف ناعم (`is_deleted`) بدل الحذف الفعلي | حفظ تاريخ البيانات |
| فهرسة الحقول المستخدمة في البحث/الفرز | الأداء |
| تخزين المبالغ كأعداد صحيحة (أصغر وحدة) | تجنّب أخطاء Floating point |

### الأعمدة المشتركة في كل جدول
```sql
id          TEXT PRIMARY KEY,        -- UUID
created_at  TEXT NOT NULL,
updated_at  TEXT NOT NULL,
is_deleted  INTEGER NOT NULL DEFAULT 0
```

### الجداول (ملف `0001_init.sql`)
```text
traders          (التجار + رصيد الدين)
vehicles         (المركبات)
drivers          (السائقون)
workers          (العمال)
invoices         (القوائم/القوائم + حالة draft/posted)
invoice_items    (الشحنات الموزونة داخل القائمة)
basket_counts    (عدد السلال)
worker_wages     (أجور العمال)
payments         (دفعات التجار / تسوية الديون)
transactions_log (سجل المعاملات الشامل)
settings         (إعدادات عامة: نسبة عarket Management System)