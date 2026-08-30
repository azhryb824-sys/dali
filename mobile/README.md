# تطبيق نظام دالي للجوال

حاوية أصلية مشتركة لـ Android وiOS تعرض النظام الإداري نفسه وصلاحياته وبياناته، من دون إنشاء قاعدة بيانات موازية. يضيف التطبيق إلى WebView الموثوق العلامة `DaliMobile/1`، بينما تبقى المصادقة والصلاحيات والتدقيق على الخادم.

## الأمان والعمل دون اتصال

- الاتصالات محصورة في `https://www.dally.info` ولا يسمح بالمحتوى المختلط.
- يمنع التقاط صورة لمحتوى التطبيق في شاشة التطبيقات الأخيرة عبر Privacy Screen.
- تحفظ الاستجابات JSON والطابور غير المتصل مشفرة بـ AES-GCM ومفتاح Web Crypto غير قابل للاستخراج داخل حاوية التطبيق.
- الحذف، والاعتماد، والترحيل، والدفع، وإدارة المستخدمين والصلاحيات لا تدخل طابور العمل دون اتصال.
- تستخدم المزامنة مسار الخادم الحالي ومفاتيح SHA-256 لمنع تنفيذ العملية مرتين.

## إنشاء المشاريع الأصلية

```bash
npm install
npm run assets
npx cap add android
npx cap add ios
npx cap sync
```

يبنى Android من Android Studio أو `npm run build:android`. ويتطلب بناء iOS جهاز macOS مع Xcode 26 أو أحدث، ثم `npm run open:ios`. قبل توقيع الإصدارات يجب إعداد مفاتيح Android وملف Apple Team وبيانات APNs/FCM الخاصة بالشركة؛ لا تحفظ هذه الأسرار في Git.

## إصدار Android الإنتاجي الموقّع

ينشئ مسار GitHub Actions اليدوي `Signed Android mobile release` ملف APK وملف AAB للمتجر من دون حفظ مواد التوقيع داخل المستودع. يجب إعداد أسرار المستودع المشفرة التالية قبل تشغيله:

- `DALI_ANDROID_KEYSTORE_BASE64`
- `DALI_ANDROID_KEYSTORE_PASSWORD`
- `DALI_ANDROID_KEY_ALIAS`
- `DALI_ANDROID_KEY_PASSWORD`
