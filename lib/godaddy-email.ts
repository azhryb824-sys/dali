const EMAIL_GATEWAY_URL = "http://127.0.0.1:2525/api/email/send";
const REQUEST_TIMEOUT_MS = 30_000;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

type GatewayResponse = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export async function sendEmail(input: SendEmailInput) {
  let response: Response;
  let body: GatewayResponse;
  try {
    response = await fetch(EMAIL_GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        ...(input.text ? { text: input.text } : {}),
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await response.json() as GatewayResponse;
  } catch (error) {
    const message = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
      ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
      : error instanceof Error ? error.message : String(error);
    throw new Error(`email gateway unreachable: ${message}`);
  }

  if (!response.ok || !body.success || !body.messageId) {
    throw new Error(`email send failed: ${body.error || `HTTP ${response.status}`}`);
  }
  return { messageId: body.messageId };
}
