export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`لم يُرجع الخادم تفاصيل العملية (HTTP ${response.status}). حدّث الصفحة ثم أعد المحاولة.`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`استجابة الخادم غير مكتملة أو غير صالحة (HTTP ${response.status}). لم يعتبر النظام العملية ناجحة.`);
  }
}
