"use client";
import { commercialAttachmentFields, commercialAttachmentRefs } from "@/lib/commercial-attachments";

export default function CommercialAttachmentFields({ defaults, required = false }: { defaults?: unknown; required?: boolean }) {
  const refs = commercialAttachmentRefs(defaults);
  return <fieldset className="commercial-attachments span-two"><legend>مرفقات الجهة المتعاقدة</legend>
    <p>تنتقل المرفقات المحفوظة مع الطلب والعرض إلى العقد دون إعادة رفعها. يمكنك استبدال الملف قبل الاعتماد.</p>
    <div className="commercial-attachment-grid">{commercialAttachmentFields.map(field => {
      const saved = refs.find(ref => ref.kind === field.kind);
      return <label key={field.kind}>{field.label}<input name={field.name} type="file" accept="application/pdf,image/png,image/jpeg" required={required && !saved}/>{saved && <small>الملف المحفوظ: {saved.fileName}</small>}<small>PDF أو صورة PNG/JPEG، حتى 10 ميجابايت.</small></label>;
    })}</div>
  </fieldset>;
}
