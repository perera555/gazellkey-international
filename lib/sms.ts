// Text messages through Notify.lk (Sri Lankan SMS gateway, https://notify.lk).
//
// Setup (once):
//   1. Create an account at app.notify.lk and top it up
//   2. Settings -> API keys: copy the User ID and API key
//   3. Put these in .env:
//        NOTIFYLK_USER_ID
//        NOTIFYLK_API_KEY
//        NOTIFYLK_SENDER_ID   (your approved sender name; "NotifyDEMO" while testing)
//
// Without them, messages are only written to the server log.

const SEND_URL = "https://app.notify.lk/api/v1/send";

function config() {
  const userId = process.env.NOTIFYLK_USER_ID?.trim();
  const apiKey = process.env.NOTIFYLK_API_KEY?.trim();
  if (!userId || !apiKey) {
    return null;
  }
  return { userId, apiKey, senderId: process.env.NOTIFYLK_SENDER_ID?.trim() || "NotifyDEMO" };
}

export function isSmsEnabled() {
  return config() != null;
}

// "077 123 4567" / "+94 77 123 4567" -> "94771234567" (the format Notify.lk wants)
export function toSmsNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length == 10) {
    return `94${digits.slice(1)}`;
  }
  if (digits.length == 9 && digits.startsWith("7")) {
    return `94${digits}`;
  }
  return digits;
}

// Throws when the gateway refuses the message (callers record the error)
export async function sendSms(phone: string, message: string) {
  const settings = config();
  const to = toSmsNumber(phone);
  if (settings == null) {
    console.log(`[SMS not set up] to ${to}: ${message}`);
    return;
  }
  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      user_id: settings.userId,
      api_key: settings.apiKey,
      sender_id: settings.senderId,
      to: to,
      message: message,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status != "success") {
    throw new Error(`SMS to ${to} failed: ${body.errors ? JSON.stringify(body.errors) : (body.message ?? response.status)}`);
  }
}
