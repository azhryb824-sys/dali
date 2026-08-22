# معالجة بناء Render عند تعارض إعداد قاعدة البيانات

يستخدم بناء Render قاعدة SQLite مؤقتة داخل `/tmp` فقط عندما يكون `DATABASE_URL` غير متوافق مع عميل SQLite/libSQL الحالي. هذا العزل يخص مرحلة البناء ولا يغيّر قاعدة الإنتاج ولا ينشئ بديلًا عنها.

عند بدء الخدمة الفعلية، يتولى `scripts/render-start.mjs` التحقق من وجود `/var/data/dali.db` غير فارغ قبل استعادة الرابط إلى القرص الدائم، ثم ينشئ نسخة احتياطية قبل تطبيق الهجرات. إذا كان ملف الإنتاج مفقودًا أو فارغًا، يتوقف التشغيل بدل إنشاء قاعدة جديدة بصمت.

المؤشرات المتوقعة في السجل:

- `[build] using isolated SQLite database for Render build`: تم عزل مرحلة البناء عن رابط غير مدعوم.
- `[startup] RENDER_DATABASE_URL_RECOVERED`: استُخدم ملف القاعدة الموجود على القرص الدائم عند التشغيل.
- `[database] backup-created ...`: أُنشئت نسخة احتياطية قبل الهجرات.

يبقى الإعداد الصحيح في لوحة Render:

```text
DATABASE_URL=file:/var/data/dali.db
UPLOADS_DIR=/var/data/uploads
```
