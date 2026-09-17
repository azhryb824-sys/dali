"use client";
import { useState } from "react";
import { createWhatsAppAppUrl, createWhatsAppUrl, createWhatsAppWebUrl, normalizeSaudiWhatsAppNumber } from "@/lib/whatsapp";
import { openDaliWhatsApp } from "@/lib/whatsapp-runtime";
export default function WhatsAppMessageDialog({ mobile, message, onClose }: {
    mobile: string;
    message: string;
    onClose: () => void;
}) {
    const [phone, setPhone] = useState(normalizeSaudiWhatsAppNumber(mobile) || mobile), [body, setBody] = useState(message), [error, setError] = useState("");
    function open(target: "app" | "web") { const whatsappUrl = createWhatsAppUrl(phone, body), whatsappAppUrl = createWhatsAppAppUrl(phone, body), whatsappWebUrl = createWhatsAppWebUrl(phone, body); if (!whatsappUrl || !whatsappAppUrl || !whatsappWebUrl) {
        setError("أدخل رقم جوال سعودي صحيحًا");
        return;
    } openDaliWhatsApp(target, { universalUrl: whatsappUrl, appUrl: whatsappAppUrl, webUrl: whatsappWebUrl, secureLaunchUrl: "" }); }
    return <div className="modal-layer"><button className="drawer-backdrop" onClick={onClose}/><section className="record-modal" role="dialog" aria-modal="true" aria-label="إرسال التعديلات إلى العميل"><div className="drawer-head"><h2>إرسال التعديلات إلى العميل</h2><button onClick={onClose}>×</button></div><label>رقم العميل<input dir="ltr" value={phone} onChange={e => setPhone(e.target.value)}/></label><label>التعديلات المطلوبة<textarea rows={7} value={body} onChange={e => setBody(e.target.value)}/></label>{error && <p role="alert">{error}</p>}<button className="admin-primary" onClick={() => open("app")}>فتح واتساب بالرسالة</button><button onClick={() => open("web")}>واتساب ويب</button></section></div>;
}
