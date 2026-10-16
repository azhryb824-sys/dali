/** Same-origin multipart upload with actual transport progress. No automatic retry. */
export function uploadWithProgress(url: string, body: FormData, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { "content-type": xhr.getResponseHeader("content-type") || "application/json" } }));
    xhr.onerror = () => reject(new Error("تعذّر الاتصال بالخادم؛ تحقق من قائمة العمال قبل إعادة المحاولة."));
    xhr.onabort = () => reject(new Error("انقطع رفع المرفقات؛ تحقق من قائمة العمال قبل إعادة المحاولة."));
    xhr.send(body);
  });
}
