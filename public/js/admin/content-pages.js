// تعريف صفحات إدارة المحتوى المبنية على مُنشئ CRUD
import { esc } from '../core/ui.js';
import { makeCrudView, yesNo, dateCell, imgCell, moneyCell } from './crud.js';
import * as f from '../core/format.js';

const hijriCell = (iso) => `<div class="small">${esc(f.dateHijriShort(iso))}</div>
  <div class="tiny faint num">${esc(f.dateShort(iso))}</div>`;

// ---------- المحاضرات ----------

export const lecturesAdmin = makeCrudView({
  title: 'المحاضرات والمجالس',
  endpoint: 'lectures',
  addLabel: 'إضافة محاضرة',
  filters: [{ name: 'is_published', label: 'حالة النشر', options: [
    { value: '1', label: 'منشورة' }, { value: '0', label: 'مخفية' }] }],
  fields: [
    { name: 'title', label: 'اسم المحاضرة', required: true,
      placeholder: 'مثال: الشباب رؤية المستقبل' },
    { name: 'speaker', label: 'تقديم المحاضرة',
      placeholder: 'مثال: أم سيد محمد الشيرازي' },
    { name: 'majlis_name', label: 'المجلس الذي يليها',
      placeholder: 'مثال: مجلس عزاء عن أم البنين عليها السلام',
      hint: 'يظهر في الواجهة مسبوقاً بكلمة «يليها»' },
    { name: 'reciter', label: 'اسم القارئ / الملا',
      placeholder: 'مثال: الملا حوراء', hint: 'قارئ مجلس العزاء الذي يلي المحاضرة' },
    { name: 'occasion', label: 'المناسبة', placeholder: 'مثال: محرم الحرام' },
    { name: 'lecture_date', label: 'تاريخ المحاضرة', type: 'date', required: true },
    { name: 'lecture_time', label: 'وقت المجلس', type: 'time', hint: 'مثال: 20:00' },
    { name: 'description', label: 'وصف المحاضرة', type: 'textarea', full: true },
    { name: 'image_path', label: 'صورة الملقي أو المناسبة', type: 'image', full: true },
    { name: 'show_in_upcoming', label: 'تظهر في قسم «المحاضرة القادمة»', type: 'checkbox' },
    { name: 'show_in_calendar', label: 'تظهر في تقويم الشهر', type: 'checkbox', default: 1 },
    { name: 'show_venue', label: 'إظهار عنوان الحسينية', type: 'checkbox', default: 1 },
    { name: 'is_published', label: 'منشورة', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'title', label: 'العنوان' },
    { key: 'image_path', label: 'صورة', render: (i) => imgCell(i.image_path) },
    { key: 'speaker', label: 'تقديم المحاضرة' },
    { key: 'reciter', label: 'القارئ' },
    { key: 'lecture_date', label: 'التاريخ', render: (i) => hijriCell(i.lecture_date) },
    { key: 'lecture_time', label: 'الوقت', render: (i) => esc(f.time12(i.lecture_time) || '—') },
    { key: 'occasion', label: 'المناسبة' },
    { key: 'show_in_upcoming', label: 'قادمة', render: (i) => yesNo(i.show_in_upcoming) },
    { key: 'is_published', label: 'منشورة', render: (i) => yesNo(i.is_published) },
  ],
});

// ---------- المناسبات ----------

export const eventsAdmin = makeCrudView({
  title: 'المناسبات',
  endpoint: 'events',
  addLabel: 'إضافة مناسبة',
  fields: [
    { name: 'title', label: 'عنوان المناسبة', required: true },
    { name: 'kind', label: 'نوع المناسبة', placeholder: 'مجلس / مولود / فاتحة / ذكرى', default: 'مناسبة' },
    { name: 'event_date', label: 'التاريخ', type: 'date', required: true },
    { name: 'event_time', label: 'الوقت', type: 'time' },
    { name: 'speaker', label: 'اسم الملقي' },
    { name: 'description', label: 'الوصف', type: 'textarea', full: true },
    { name: 'image_path', label: 'صورة المناسبة', type: 'image', full: true },
    { name: 'show_in_upcoming', label: 'تظهر في المناسبات القادمة', type: 'checkbox', default: 1 },
    { name: 'show_in_calendar', label: 'تظهر في تقويم الشهر', type: 'checkbox', default: 1 },
    { name: 'show_venue', label: 'إظهار عنوان الحسينية', type: 'checkbox', default: 1 },
    { name: 'is_published', label: 'منشورة', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'title', label: 'العنوان' },
    { key: 'kind', label: 'النوع' },
    { key: 'event_date', label: 'التاريخ', render: (i) => hijriCell(i.event_date) },
    { key: 'event_time', label: 'الوقت', render: (i) => esc(f.time12(i.event_time) || '—') },
    { key: 'is_published', label: 'منشورة', render: (i) => yesNo(i.is_published) },
  ],
});

// ---------- معرض الصور ----------

export const galleryAdmin = makeCrudView({
  title: 'معرض الصور',
  endpoint: 'gallery',
  addLabel: 'رفع صورة',
  searchable: true,
  filters: [{ name: 'category', label: 'التصنيف', options: [
    { value: 'exterior', label: 'من الخارج' },
    { value: 'interior', label: 'من الداخل' },
    { value: 'occasions', label: 'مناسبات سابقة' }] }],
  fields: [
    { name: 'image_path', label: 'الصورة', type: 'image', required: true, full: true },
    { name: 'title', label: 'عنوان الصورة' },
    { name: 'category', label: 'التصنيف', type: 'select', options: [
      { value: 'exterior', label: 'من الخارج' },
      { value: 'interior', label: 'من الداخل' },
      { value: 'occasions', label: 'مناسبات سابقة' }] },
    { name: 'description', label: 'وصف اختياري', type: 'textarea', full: true },
    { name: 'sort_order', label: 'الترتيب', type: 'number', min: 0, default: 0 },
    { name: 'is_cover', label: 'الصورة الرئيسية', type: 'checkbox' },
  ],
  columns: [
    { key: 'image_path', label: 'الصورة', render: (i) => imgCell(i.image_path) },
    { key: 'title', label: 'العنوان' },
    { key: 'category', label: 'التصنيف', render: (i) => esc(
      { exterior: 'من الخارج', interior: 'من الداخل', occasions: 'مناسبات' }[i.category] || i.category) },
    { key: 'sort_order', label: 'الترتيب' },
    { key: 'is_cover', label: 'رئيسية', render: (i) => yesNo(i.is_cover) },
  ],
});

// ---------- المفقودات ----------

export const lostFoundAdmin = makeCrudView({
  title: 'المفقودات',
  endpoint: 'lost-found',
  addLabel: 'إضافة مفقود',
  filters: [{ name: 'status', label: 'الحالة', options: [
    { value: 'available', label: 'متوفر' }, { value: 'delivered', label: 'تم تسليمه' }] }],
  fields: [
    { name: 'item_name', label: 'اسم الغرض', required: true, placeholder: 'مثال: حقيبة نسائية سوداء' },
    { name: 'found_date', label: 'تاريخ العثور', type: 'date', required: true },
    { name: 'description', label: 'وصف مختصر', type: 'textarea', full: true },
    { name: 'image_path', label: 'صورة الغرض', type: 'image', full: true },
    { name: 'found_place', label: 'مكان العثور عليه', placeholder: 'مثال: القاعة الرئيسية' },
    { name: 'show_place', label: 'إظهار مكان العثور للعامة', type: 'checkbox', default: 1 },
    { name: 'status', label: 'الحالة', type: 'select', options: [
      { value: 'available', label: 'متوفر' }, { value: 'delivered', label: 'تم تسليمه' }] },
    { name: 'internal_note', label: 'ملاحظة داخلية (لا تظهر للعامة)', type: 'textarea', full: true },
    { name: 'is_published', label: 'منشور', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'item_name', label: 'الغرض' },
    { key: 'image_path', label: 'صورة', render: (i) => imgCell(i.image_path) },
    { key: 'found_date', label: 'تاريخ العثور', render: (i) => dateCell(i.found_date) },
    { key: 'found_place', label: 'المكان' },
    { key: 'status', label: 'الحالة', render: (i) => i.status === 'delivered'
      ? '<span class="badge badge--muted">تم تسليمه</span>'
      : '<span class="badge badge--ok">متوفر</span>' },
    { key: 'is_published', label: 'منشور', render: (i) => yesNo(i.is_published) },
  ],
});

// ---------- الإعلانات ----------

export const adsAdmin = makeCrudView({
  title: 'الإعلانات',
  endpoint: 'ads',
  addLabel: 'إضافة إعلان',
  filters: [{ name: 'placement', label: 'مكان الظهور', options: [
    { value: 'home', label: 'الصفحة الرئيسية' },
    { value: 'donations', label: 'قسم التبرعات' },
    { value: 'both', label: 'الاثنان' }] }],
  fields: [
    { name: 'title', label: 'عنوان الإعلان', required: true },
    { name: 'description', label: 'وصف الإعلان', type: 'textarea', full: true },
    { name: 'image_path', label: 'صورة الإعلان', type: 'image', full: true },
    { name: 'link_url', label: 'رابط عند الضغط', placeholder: 'https://', hint: 'اتركه فارغاً إن لم يكن هناك رابط' },
    { name: 'placement', label: 'مكان الظهور', type: 'select', options: [
      { value: 'home', label: 'الصفحة الرئيسية' },
      { value: 'donations', label: 'قسم التبرعات' },
      { value: 'both', label: 'الاثنان' }] },
    { name: 'start_date', label: 'تاريخ بداية الإعلان', type: 'date' },
    { name: 'end_date', label: 'تاريخ نهاية الإعلان', type: 'date' },
    { name: 'sort_order', label: 'الترتيب', type: 'number', min: 0, default: 0 },
    { name: 'is_active', label: 'مُفعّل', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'title', label: 'العنوان' },
    { key: 'image_path', label: 'صورة', render: (i) => imgCell(i.image_path) },
    { key: 'placement', label: 'المكان', render: (i) => esc(
      { home: 'الرئيسية', donations: 'التبرعات', both: 'الاثنان' }[i.placement] || i.placement) },
    { key: 'start_date', label: 'من', render: (i) => (i.start_date ? dateCell(i.start_date) : '—') },
    { key: 'end_date', label: 'إلى', render: (i) => (i.end_date ? dateCell(i.end_date) : '—') },
    { key: 'is_active', label: 'مُفعّل', render: (i) => yesNo(i.is_active) },
  ],
});

// ---------- حملات التبرع ----------

export const campaignsAdmin = makeCrudView({
  title: 'حملات التبرع',
  endpoint: 'donation-campaigns',
  addLabel: 'إضافة حملة',
  fields: [
    { name: 'title', label: 'عنوان الحملة', required: true },
    { name: 'description', label: 'وصف الحملة', type: 'textarea', full: true },
    { name: 'image_path', label: 'صورة الحملة', type: 'image', full: true },
    { name: 'goal_amount', label: 'المبلغ المستهدف (اختياري)', type: 'number', min: 0, default: 0 },
    { name: 'sort_order', label: 'الترتيب', type: 'number', min: 0, default: 0 },
    { name: 'is_active', label: 'مُفعّلة', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'title', label: 'الحملة' },
    { key: 'image_path', label: 'صورة', render: (i) => imgCell(i.image_path) },
    { key: 'goal_amount', label: 'المستهدف', render: (i) => moneyCell(i.goal_amount) },
    { key: 'is_active', label: 'مُفعّلة', render: (i) => yesNo(i.is_active) },
  ],
});

// ---------- سجل التبرعات ----------

export const donationsLogAdmin = makeCrudView({
  title: 'سجل التبرعات',
  endpoint: 'donations',
  addLabel: 'تسجيل تبرع',
  fields: [
    { name: 'donor_name', label: 'اسم المتبرع', default: 'فاعل خير' },
    { name: 'amount', label: 'المبلغ', type: 'number', min: 0, required: true },
    { name: 'method_name', label: 'طريقة التبرع', placeholder: 'كي كارد / زين كاش / تحويل رصيد' },
    { name: 'donated_at', label: 'تاريخ التبرع', type: 'date', required: true },
    { name: 'campaign_id', label: 'رقم الحملة (اختياري)', type: 'number', min: 1 },
    { name: 'note', label: 'ملاحظة', type: 'textarea', full: true },
  ],
  columns: [
    { key: 'donor_name', label: 'المتبرع' },
    { key: 'amount', label: 'المبلغ', render: (i) => moneyCell(i.amount) },
    { key: 'method_name', label: 'الطريقة' },
    { key: 'donated_at', label: 'التاريخ', render: (i) => dateCell(i.donated_at) },
  ],
});

// ---------- أنواع المناسبات ----------

export const eventTypesAdmin = makeCrudView({
  title: 'أنواع المناسبات',
  endpoint: 'event-types',
  addLabel: 'إضافة نوع',
  searchable: false,
  fields: [
    { name: 'name', label: 'اسم النوع', required: true, placeholder: 'مثال: مجلس' },
    { name: 'slug', label: 'المعرّف (بالإنجليزية)', placeholder: 'majlis', hint: 'يُترك فارغاً للتوليد التلقائي' },
    { name: 'sort_order', label: 'الترتيب', type: 'number', min: 0, default: 0 },
    { name: 'allows_custom_text', label: 'يفتح حقلاً نصياً للمستخدم (خيار «أخرى»)', type: 'checkbox' },
    { name: 'is_active', label: 'مُفعّل', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'name', label: 'النوع' },
    { key: 'slug', label: 'المعرّف' },
    { key: 'allows_custom_text', label: 'حقل نصي', render: (i) => yesNo(i.allows_custom_text) },
    { key: 'sort_order', label: 'الترتيب' },
    { key: 'is_active', label: 'مُفعّل', render: (i) => yesNo(i.is_active) },
  ],
});

// ---------- خيارات الطعام ----------

export const foodOptionsAdmin = makeCrudView({
  title: 'خيارات الطعام',
  endpoint: 'food-options',
  addLabel: 'إضافة خيار',
  searchable: false,
  fields: [
    { name: 'label', label: 'عنوان الخيار', required: true },
    { name: 'slug', label: 'المعرّف', placeholder: 'host / kitchen',
      hint: 'استخدم kitchen للخيار الذي تُضاف له تكلفة طعام' },
    { name: 'description', label: 'الشرح الذي يظهر للمستخدم', type: 'textarea', full: true },
    { name: 'sort_order', label: 'الترتيب', type: 'number', min: 0, default: 0 },
    { name: 'has_cost', label: 'يضيف تكلفة طعام إلى الفاتورة', type: 'checkbox' },
    { name: 'is_active', label: 'مُفعّل', type: 'checkbox', default: 1 },
  ],
  columns: [
    { key: 'label', label: 'الخيار' },
    { key: 'slug', label: 'المعرّف' },
    { key: 'has_cost', label: 'له تكلفة', render: (i) => yesNo(i.has_cost) },
    { key: 'is_active', label: 'مُفعّل', render: (i) => yesNo(i.is_active) },
  ],
});
