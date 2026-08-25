function responseReference(response: Response) {
  return response.headers.get("x-correlation-id")
    || response.headers.get("x-request-id")
    || response.headers.get("trace-id")
    || "";
}

function responseError(response: Response, message: string) {
  const reference = responseReference(response);
  return `${message} (HTTP ${response.status})${reference ? ` — مرجع التتبع: ${reference}` : ""}`;
}

export async function readApiJson<T>(response: Response, fallbackMessage = "تعذّر قراءة استجابة الخادم"): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(responseError(response, `${fallbackMessage}: لم يُرجع الخادم تفاصيل العملية. حدّث الصفحة ثم أعد المحاولة.`));
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(responseError(response, `${fallbackMessage}: استجابة الخادم غير مكتملة أو غير صالحة، ولم يعتبر النظام العملية ناجحة.`));
  }
}
