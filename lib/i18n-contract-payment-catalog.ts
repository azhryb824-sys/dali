export const contractPaymentUiTranslations: Record<
  string,
  { en: string; bn: string }
> = {
  "— الخزينة": { en: "— Cash treasury", bn: "— নগদ তহবিল" },
  "· متبقي": { en: "· Remaining", bn: "· অবশিষ্ট" },
  "إجمالي مبلغ السداد غير صحيح": {
    en: "The total payment amount is invalid",
    bn: "মোট পরিশোধের পরিমাণ সঠিক নয়",
  },
  "أحد الحسابات البنكية غير موجود أو غير نشط": {
    en: "A selected bank account does not exist or is inactive",
    bn: "নির্বাচিত একটি ব্যাংক হিসাব নেই বা নিষ্ক্রিয়",
  },
  "اختر الحساب البنكي لكل مبلغ محوّل أو شيك": {
    en: "Select a bank account for every transfer or cheque amount",
    bn: "প্রতিটি ব্যাংক স্থানান্তর বা চেকের জন্য একটি ব্যাংক হিসাব নির্বাচন করুন",
  },
  "اختر الحساب البنكي.": {
    en: "Select the bank account.",
    bn: "ব্যাংক হিসাব নির্বাচন করুন।",
  },
  "اختر عاملًا مطابقًا": {
    en: "Select a matching worker",
    bn: "মিল আছে এমন কর্মী নির্বাচন করুন",
  },
  "إدارة العمال مباشرة": {
    en: "Manage workers directly",
    bn: "সরাসরি কর্মী পরিচালনা করুন",
  },
  "أدخل مبلغ السداد.": {
    en: "Enter the payment amount.",
    bn: "পরিশোধের পরিমাণ লিখুন।",
  },
  "أدخل مرجع التحويل أو الشيك لكل مبلغ بنكي": {
    en: "Enter the transfer or cheque reference for every bank amount",
    bn: "প্রতিটি ব্যাংক পরিমাণের জন্য স্থানান্তর বা চেক রেফারেন্স লিখুন",
  },
  "أدخل مرجع التحويل أو الشيك.": {
    en: "Enter the transfer or cheque reference.",
    bn: "স্থানান্তর বা চেক রেফারেন্স লিখুন।",
  },
  "إسناد العامل": { en: "Assign worker", bn: "কর্মী নিয়োগ করুন" },
  "إسناد العمال، إنهاء الإسناد، متابعة العجز، وإدارة الحالات التشغيلية مباشرة من مساحة واحدة وفق صلاحية المشرف.": {
    en: "Assign and release workers, monitor shortages, and manage operational statuses from one workspace under supervisor permissions.",
    bn: "তত্ত্বাবধায়কের অনুমতি অনুযায়ী এক কর্মক্ষেত্র থেকে কর্মী নিয়োগ ও অবমুক্ত করুন, ঘাটতি দেখুন এবং পরিচালনাগত অবস্থা নিয়ন্ত্রণ করুন।",
  },
  "أضف مبلغًا نقديًا أو بنكيًا واحدًا على الأقل": {
    en: "Add at least one cash or bank amount",
    bn: "অন্তত একটি নগদ বা ব্যাংক পরিমাণ যোগ করুন",
  },
  "إغلاق الإدارة المباشرة": {
    en: "Close direct management",
    bn: "সরাসরি ব্যবস্থাপনা বন্ধ করুন",
  },
  "إغلاق نموذج تسجيل السداد": {
    en: "Close payment form",
    bn: "পরিশোধ ফরম বন্ধ করুন",
  },
  "افتح الإدارة المباشرة لإسناد العامل المطابق للمهنة والكفالة أو إنهاء إسناده مع حفظ التاريخ.": {
    en: "Open direct management to assign or release a worker who matches the profession and sponsorship while preserving history.",
    bn: "পেশা ও স্পনসরশিপের সঙ্গে মিল থাকা কর্মী নিয়োগ বা অবমুক্ত করতে সরাসরি ব্যবস্থাপনা খুলুন এবং ইতিহাস সংরক্ষণ করুন।",
  },
  "اكتب سبب عكس واضحًا لا يقل عن 10 أحرف": {
    en: "Enter a clear reversal reason of at least 10 characters",
    bn: "কমপক্ষে ১০ অক্ষরের একটি স্পষ্ট বিপরীতকরণ কারণ লিখুন",
  },
  "اكتمل عكس تحصيل دفعة عقد": {
    en: "Contract payment receipt reversal completed",
    bn: "চুক্তির কিস্তি আদায়ের বিপরীতকরণ সম্পন্ন হয়েছে",
  },
  "الرصيد القائم": { en: "Outstanding balance", bn: "বকেয়া স্থিতি" },
  "السجل المالي المرتبط بالدفعة غير موجود": {
    en: "The financial record linked to the installment was not found",
    bn: "কিস্তির সঙ্গে যুক্ত আর্থিক রেকর্ড পাওয়া যায়নি",
  },
  "السجل المالي المرتبط غير موجود": {
    en: "The linked financial record was not found",
    bn: "সংযুক্ত আর্থিক রেকর্ড পাওয়া যায়নি",
  },
  "العقد ← الاستحقاق ← الفاتورة ← التحصيل الجزئي أو الكامل ← القيد المالي أو الإحالة القانونية.": {
    en: "Contract ← due amount ← invoice ← partial or full collection ← journal entry or legal referral.",
    bn: "চুক্তি ← পাওনা ← চালান ← আংশিক বা পূর্ণ আদায় ← হিসাব এন্ট্রি বা আইনগত রেফারেল।",
  },
  "أُلغي سداد غير مرحّل": {
    en: "Unposted payment cancelled",
    bn: "পোস্ট না করা পরিশোধ বাতিল হয়েছে",
  },
  "أُلغي قيد السداد غير المرحّل وأعيد احتساب المتبقي والحالة المالية.": {
    en: "The unposted payment entry was cancelled and the remaining balance and financial status were recalculated.",
    bn: "পোস্ট না করা পরিশোধ এন্ট্রি বাতিল করে অবশিষ্ট স্থিতি ও আর্থিক অবস্থা পুনরায় গণনা করা হয়েছে।",
  },
  "الفاتورة": { en: "Invoice", bn: "চালান" },
  "المبلغ النقدي بالريال": {
    en: "Cash amount in SAR",
    bn: "রিয়ালে নগদ পরিমাণ",
  },
  "المتبقي": { en: "Remaining", bn: "অবশিষ্ট" },
  "المتبقي على الفواتير": {
    en: "Invoice balance remaining",
    bn: "চালানের অবশিষ্ট স্থিতি",
  },
  "المحصل فعليًا": { en: "Actually collected", bn: "প্রকৃত আদায়" },
  "المسدد جزئيًا": { en: "Partially paid", bn: "আংশিক পরিশোধিত" },
  "المسدد سابقًا": { en: "Previously paid", bn: "আগে পরিশোধিত" },
  "المسدد والمتبقي": { en: "Paid and remaining", bn: "পরিশোধিত ও অবশিষ্ট" },
  "أُنشئ القيد العكسي، ويظل أثر السداد قائمًا حتى اعتماده وترحيله.": {
    en: "A reversal entry was created; the payment effect remains until it is approved and posted.",
    bn: "একটি বিপরীত এন্ট্রি তৈরি হয়েছে; অনুমোদন ও পোস্ট না হওয়া পর্যন্ত পরিশোধের প্রভাব বহাল থাকবে।",
  },
  "بحث بالاسم أو الرقم أو المهنة": {
    en: "Search by name, number, or profession",
    bn: "নাম, নম্বর বা পেশা দিয়ে খুঁজুন",
  },
  "بيان اختياري للسداد": {
    en: "Optional payment description",
    bn: "পরিশোধের ঐচ্ছিক বিবরণ",
  },
  "بيانات العقد المالية غير مكتملة": {
    en: "The contract financial data is incomplete",
    bn: "চুক্তির আর্থিক তথ্য অসম্পূর্ণ",
  },
  "تاريخ السداد": { en: "Payment date", bn: "পরিশোধের তারিখ" },
  "تاريخ السداد غير صحيح أو يقع في المستقبل": {
    en: "The payment date is invalid or in the future",
    bn: "পরিশোধের তারিখ সঠিক নয় বা ভবিষ্যতের",
  },
  "تحصيل عميل": { en: "Customer receipt", bn: "গ্রাহক আদায়" },
  "تحويل بنكي + نقدي": {
    en: "Bank transfer + cash",
    bn: "ব্যাংক স্থানান্তর + নগদ",
  },
  "تسجيل تحصيل العميل": {
    en: "Record customer receipt",
    bn: "গ্রাহক আদায় নথিভুক্ত করুন",
  },
  "تسجيل تحصيل الفاتورة": {
    en: "Record invoice collection",
    bn: "চালান আদায় নথিভুক্ত করুন",
  },
  "تعذر تحديث حالة العامل": {
    en: "Worker status could not be updated",
    bn: "কর্মীর অবস্থা হালনাগাদ করা যায়নি",
  },
  "تعذّر تسجيل السداد": {
    en: "Payment could not be recorded",
    bn: "পরিশোধ নথিভুক্ত করা যায়নি",
  },
  "تعذر ربط قيد السداد بدفعة العقد.": {
    en: "The payment entry could not be linked to the contract installment.",
    bn: "পরিশোধ এন্ট্রিটি চুক্তির কিস্তির সঙ্গে যুক্ত করা যায়নি।",
  },
  "تعذر عكس السداد": {
    en: "Payment could not be reversed",
    bn: "পরিশোধ বিপরীত করা যায়নি",
  },
  "تغير سجل السداد قبل إنشاء العكس": {
    en: "The payment record changed before the reversal was created",
    bn: "বিপরীত এন্ট্রি তৈরির আগে পরিশোধ রেকর্ড পরিবর্তিত হয়েছে",
  },
  "تغير مبلغ الدفعة قبل الحفظ": {
    en: "The installment amount changed before saving",
    bn: "সংরক্ষণের আগে কিস্তির পরিমাণ পরিবর্তিত হয়েছে",
  },
  "تغيرت حالة الدفعة قبل حفظ السداد": {
    en: "The installment status changed before the payment was saved",
    bn: "পরিশোধ সংরক্ষণের আগে কিস্তির অবস্থা পরিবর্তিত হয়েছে",
  },
  "تغيرت حالة السداد قبل تنفيذ العكس": {
    en: "The payment status changed before the reversal was applied",
    bn: "বিপরীতকরণ করার আগে পরিশোধের অবস্থা পরিবর্তিত হয়েছে",
  },
  "تغيرت حالة ترحيل الاستحقاق قبل حفظ السداد": {
    en: "The due entry posting status changed before the payment was saved",
    bn: "পরিশোধ সংরক্ষণের আগে পাওনা এন্ট্রির পোস্টিং অবস্থা পরিবর্তিত হয়েছে",
  },
  "تغيير حالة العامل غير المسند بين متاح، إجازة، وموقوف دون المساس بسجله أو حركاته المالية.": {
    en: "Change an unassigned worker between available, on leave, and suspended without altering their record or financial transactions.",
    bn: "অনিয়োজিত কর্মীর অবস্থা উপলভ্য, ছুটিতে বা স্থগিত হিসেবে বদলান; তার রেকর্ড বা আর্থিক লেনদেন অপরিবর্তিত থাকবে।",
  },
  "تم تحديث الحالة التشغيلية للعامل وتوثيقها.": {
    en: "The worker operational status was updated and logged.",
    bn: "কর্মীর পরিচালনাগত অবস্থা হালনাগাদ ও নথিভুক্ত হয়েছে।",
  },
  "تم تسجيل السداد وتوزيعه وإنشاء قيد متوازن مستقل بانتظار الاعتماد والترحيل.": {
    en: "The payment and its allocation were recorded, and a separate balanced entry is awaiting approval and posting.",
    bn: "পরিশোধ ও তার বণ্টন নথিভুক্ত হয়েছে এবং একটি পৃথক ভারসাম্যপূর্ণ এন্ট্রি অনুমোদন ও পোস্টিংয়ের অপেক্ষায় আছে।",
  },
  "توقع نقدي للمتبقي": {
    en: "Cash forecast for the remainder",
    bn: "অবশিষ্টের নগদ পূর্বাভাস",
  },
  "جارٍ الإنهاء...": { en: "Releasing...", bn: "অবমুক্ত করা হচ্ছে..." },
  "جزء من دفعة عقد ما زال متأخرًا": {
    en: "Part of a contract installment remains overdue",
    bn: "চুক্তির কিস্তির একটি অংশ এখনও বকেয়া",
  },
  "حالة قيد السداد لا تسمح بالعكس": {
    en: "The payment entry status does not allow reversal",
    bn: "পরিশোধ এন্ট্রির অবস্থা বিপরীতকরণের অনুমতি দেয় না",
  },
  "حساب النقدية في الخزينة 1100 غير مهيأ للترحيل": {
    en: "Cash treasury account 1100 is not configured for posting",
    bn: "নগদ তহবিল হিসাব ১১০০ পোস্টিংয়ের জন্য কনফিগার করা নেই",
  },
  "حساب النقدية في الخزينة 1100 غير مهيأ.": {
    en: "Cash treasury account 1100 is not configured.",
    bn: "নগদ তহবিল হিসাব ১১০০ কনফিগার করা নেই।",
  },
  "حساب النقدية في الخزينة غير مهيأ.": {
    en: "The cash treasury account is not configured.",
    bn: "নগদ তহবিল হিসাব কনফিগার করা নেই।",
  },
  "حساب ذمم العملاء 1300 غير مهيأ للترحيل": {
    en: "Customer receivables account 1300 is not configured for posting",
    bn: "গ্রাহক পাওনা হিসাব ১৩০০ পোস্টিংয়ের জন্য কনফিগার করা নেই",
  },
  "حساب ذمم الموردين 2100 غير مهيأ للترحيل": {
    en: "Supplier payables account 2100 is not configured for posting",
    bn: "সরবরাহকারী প্রদেয় হিসাব ২১০০ পোস্টিংয়ের জন্য কনফিগার করা নেই",
  },
  "دون رقم إقامة": { en: "No Iqama number", bn: "ইকামা নম্বর নেই" },
  "سابق": { en: "Legacy", bn: "পুরোনো" },
  "سجل السداد": { en: "Payment history", bn: "পরিশোধের ইতিহাস" },
  "سجل السداد غير موجود لهذه الفاتورة": {
    en: "The payment record was not found for this invoice",
    bn: "এই চালানের পরিশোধ রেকর্ড পাওয়া যায়নি",
  },
  "سُجل تحصيل فاتورة عميل": {
    en: "Customer invoice receipt recorded",
    bn: "গ্রাহক চালান আদায় নথিভুক্ত হয়েছে",
  },
  "سُجل سداد آخر وتغير المبلغ المتبقي؛ حدّث الصفحة وحاول مجددًا": {
    en: "Another payment was recorded and the remaining amount changed; refresh and try again",
    bn: "আরেকটি পরিশোধ নথিভুক্ত হয়েছে এবং অবশিষ্ট পরিমাণ বদলেছে; পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন",
  },
  "سُجل سداد مستحق مورد": {
    en: "Supplier payable payment recorded",
    bn: "সরবরাহকারীর প্রদেয় পরিশোধ নথিভুক্ত হয়েছে",
  },
  "سداد مورد": { en: "Supplier payment", bn: "সরবরাহকারী পরিশোধ" },
  "طريقة السداد": { en: "Payment method", bn: "পরিশোধের পদ্ধতি" },
  "عكس السداد": { en: "Reverse payment", bn: "পরিশোধ বিপরীত করুন" },
  "عكس بانتظار الترحيل": {
    en: "Reversal awaiting posting",
    bn: "বিপরীত এন্ট্রি পোস্টিংয়ের অপেক্ষায়",
  },
  "عكس سجل السداد": {
    en: "Reverse payment record",
    bn: "পরিশোধ রেকর্ড বিপরীত করুন",
  },
  "عكس هذا السداد بانتظار اعتماد وترحيل القيد العكسي": {
    en: "This payment reversal is awaiting approval and posting of the reversal entry",
    bn: "এই পরিশোধের বিপরীতকরণ বিপরীত এন্ট্রির অনুমোদন ও পোস্টিংয়ের অপেক্ষায় আছে",
  },
  "غير مهيأ": { en: "Not configured", bn: "কনফিগার করা নেই" },
  "في الدفع المختلط أدخل مبلغ التحويل والمبلغ النقدي معًا.": {
    en: "For a mixed payment, enter both the transfer and cash amounts.",
    bn: "মিশ্র পরিশোধের জন্য স্থানান্তর ও নগদ উভয় পরিমাণ লিখুন।",
  },
  "قائمة العمال التشغيلية": {
    en: "Operational worker roster",
    bn: "পরিচালনাগত কর্মী তালিকা",
  },
  "قيد السداد المرتبط غير موجود": {
    en: "The linked payment entry was not found",
    bn: "সংযুক্ত পরিশোধ এন্ট্রি পাওয়া যায়নি",
  },
  "قيد عكس سداد بانتظار الاعتماد": {
    en: "Payment reversal entry awaiting approval",
    bn: "পরিশোধের বিপরীত এন্ট্রি অনুমোদনের অপেক্ষায়",
  },
  "قيمة الفاتورة": { en: "Invoice amount", bn: "চালানের পরিমাণ" },
  "قيمة الفواتير": { en: "Invoice value", bn: "চালানের মূল্য" },
  "كامل أو جزء متبقٍ": {
    en: "Full or remaining portion",
    bn: "সম্পূর্ণ বা অবশিষ্ট অংশ",
  },
  "كل الحالات": { en: "All statuses", bn: "সব অবস্থা" },
  "لا توجد عمالة مطابقة.": {
    en: "No matching workers.",
    bn: "মিল আছে এমন কোনো কর্মী নেই।",
  },
  "لا يمكن تسجيل السداد قبل إصدار الفاتورة أو بعد اكتماله": {
    en: "Payment cannot be recorded before invoicing or after full settlement",
    bn: "চালান ইস্যুর আগে বা সম্পূর্ণ পরিশোধের পরে নতুন পরিশোধ নথিভুক্ত করা যাবে না",
  },
  "لا يوجد حساب بنكي نشط. أضفه من الأستاذ العام أولًا.": {
    en: "No active bank account exists. Add one in the general ledger first.",
    bn: "কোনো সক্রিয় ব্যাংক হিসাব নেই। প্রথমে সাধারণ খতিয়ানে একটি যোগ করুন।",
  },
  "لا يوجد عامل متاح يطابق المهنة والكفالة.": {
    en: "No available worker matches the profession and sponsorship.",
    bn: "পেশা ও স্পনসরশিপের সঙ্গে মেলে এমন উপলভ্য কর্মী নেই।",
  },
  "لا يوجد عامل مسند لهذه المهنة.": {
    en: "No worker is assigned to this profession.",
    bn: "এই পেশায় কোনো কর্মী নিয়োজিত নেই।",
  },
  "مبالغ أو طرق السداد غير صحيحة": {
    en: "The payment amounts or methods are invalid",
    bn: "পরিশোধের পরিমাণ বা পদ্ধতি সঠিক নয়",
  },
  "مبلغ التحويل بالريال": {
    en: "Transfer amount in SAR",
    bn: "রিয়ালে স্থানান্তরের পরিমাণ",
  },
  "مبلغ الشيك": { en: "Cheque amount", bn: "চেকের পরিমাণ" },
  "متبقي": { en: "Remaining", bn: "অবশিষ্ট" },
  "مدفوع جزئيًا": { en: "Partially paid", bn: "আংশিক পরিশোধিত" },
  "مسدد": { en: "Paid", bn: "পরিশোধিত" },
  "مسددة جزئيًا": { en: "Partially paid", bn: "আংশিক পরিশোধিত" },
  "مسند": { en: "Assigned", bn: "নিয়োজিত" },
  "مفوتر": { en: "Invoiced", bn: "চালানকৃত" },
  "هذا السداد معكوس أو ملغى مسبقًا": {
    en: "This payment was already reversed or cancelled",
    bn: "এই পরিশোধ ইতিমধ্যে বিপরীত বা বাতিল করা হয়েছে",
  },
  "يجب اعتماد وترحيل قيد الفاتورة أو الاستحقاق قبل تسجيل السداد": {
    en: "The invoice or payable entry must be approved and posted before recording payment",
    bn: "পরিশোধ নথিভুক্ত করার আগে চালান বা প্রদেয় এন্ট্রি অনুমোদন ও পোস্ট করতে হবে",
  },
  "يشمل التحصيل الجزئي": {
    en: "Includes partial collection",
    bn: "আংশিক আদায় অন্তর্ভুক্ত",
  },
  "يصبح الإسناد متاحًا بعد تحويل العقد إلى ساري.": {
    en: "Assignment becomes available after the contract is activated.",
    bn: "চুক্তি সক্রিয় হওয়ার পরে নিয়োগ উপলভ্য হবে।",
  },
  "يمكن تسجيل جزء من المتبقي الآن وإضافة الباقي لاحقًا. ينشئ النظام قيدًا متوازنًا مستقلًا لكل عملية ويحفظ توزيع النقد والبنك.": {
    en: "You can record part of the balance now and add the rest later. The system creates a separate balanced entry for each transaction and preserves the cash and bank allocation.",
    bn: "এখন অবশিষ্টের একটি অংশ নথিভুক্ত করে বাকিটা পরে যোগ করা যাবে। সিস্টেম প্রতিটি লেনদেনের জন্য পৃথক ভারসাম্যপূর্ণ এন্ট্রি তৈরি করে এবং নগদ ও ব্যাংক বণ্টন সংরক্ষণ করে।",
  },
  "يوجد عكس سداد بانتظار الاعتماد والترحيل؛ أكمله قبل إضافة سداد جديد": {
    en: "A payment reversal is awaiting approval and posting; complete it before adding another payment",
    bn: "একটি পরিশোধ বিপরীতকরণ অনুমোদন ও পোস্টিংয়ের অপেক্ষায় আছে; নতুন পরিশোধ যোগ করার আগে এটি সম্পন্ন করুন",
  },
};
