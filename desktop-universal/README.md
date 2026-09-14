# تطبيق دالي الجديد لنظام macOS

هذا تطبيق مستقل عن تطبيق ماك السابق ولا يستبدله ولا يستخدم مجلد بياناته.

- المعرّف: `sa.dally.desktop.universal`
- الإصدار الأول: `1.0.0`
- المعماريات: Apple Silicon وIntel داخل حزمة Universal واحدة.
- الحد الأدنى للنظام: macOS 12.
- بوابة العمل: `https://www.dally.info` بهوية تطبيق سطح المكتب المعتمدة.
- تغييرات واجهة النظام والبيانات، ومنها قوائم البنوك، تصل من الخادم تلقائيًا دون إعادة تثبيت التطبيق.

## البناء

```bash
cd desktop-universal
npm ci
npm run check
npm run build:mac
```

ملفا DMG وZIP الناتجان مستقلان داخل `desktop-universal/dist`.
