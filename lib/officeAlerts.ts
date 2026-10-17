import prisma from "@/lib/prisma";
import { EntityType, NotificationChannel, NotificationStatus } from "@/app/generated/prisma/enums";
import { isCalendarEnabled, saveCalendarEvent } from "@/lib/googleCalendar";
import { sendSms } from "@/lib/sms";

// Alerts for the office when a customer books an appointment or sends an
// enquiry:
//   - an SMS to OFFICE_ALERT_PHONE (lib/sms.ts, needs Notify.lk set up)
//   - for enquiries, a short "Reply to enquiry" note in the office Google
//     Calendar whose pop-up reminder reaches staff phones within minutes
//     (appointments get their own calendar event, see lib/appointments.ts)
// Every alert is best effort: it never throws, so a customer's booking or
// enquiry never fails because a phone or Google is unreachable.

// "Nimal Perera 0771234567" for an alert (last name and phone are optional)
export function customerName(customer: { firstName: string; lastName: string | null }) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ");
}

export function customerContact(customer: { firstName: string; lastName: string | null; phone: string | null }) {
  return [customerName(customer), customer.phone].filter(Boolean).join(" ");
}

// Link into the admin portal (ADMIN_URL in .env)
export function adminUrl(path: string) {
  const base = (process.env.ADMIN_URL ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}${path}`;
}

// Sends one SMS to the office phone and keeps it in the notification history
export async function smsOffice(message: string, entityType: EntityType, entityId: string) {
  const phone = process.env.OFFICE_ALERT_PHONE?.trim();
  if (!phone) {
    console.log(`[office alert, no OFFICE_ALERT_PHONE set] ${message}`);
    return;
  }
  try {
    const notification = await prisma.notification.create({
      data: {
        channel: NotificationChannel.SMS,
        recipient: phone,
        subject: "Office alert",
        body: message,
        entityType: entityType,
        entityId: entityId,
      },
    });
    try {
      await sendSms(phone, message);
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, error: String(error) },
      });
    }
  } catch (error) {
    console.error("Office SMS alert failed", error);
  }
}

const REMINDER_DELAY_MINUTES = 10;

// "Reply to enquiry" note in the office calendar, starting in about 10
// minutes with a pop-up 5 minutes before - so phones ring in ~5 minutes and
// the enquiry stays visible in the day's calendar. Shown as free time, so it
// never blocks appointment slots.
export async function addEnquiryReminder(enquiry: {
  id: string;
  reference: string;
  division: string;
  subject: string;
  message: string;
  customer: { firstName: string; lastName: string | null; email: string; phone: string | null };
}) {
  if (!isCalendarEnabled()) {
    return;
  }
  try {
    const start = new Date(Date.now() + REMINDER_DELAY_MINUTES * 60_000);
    start.setSeconds(0, 0);
    const name = customerName(enquiry.customer);
    await saveCalendarEvent({
      enquiryId: enquiry.id,
      summary: `Reply to enquiry: ${enquiry.subject} - ${name} [${enquiry.reference}]`,
      description: [
        `New enquiry ${enquiry.reference} (${enquiry.division}). Open it in the admin portal:`,
        adminUrl(`/enquiries?search=${encodeURIComponent(enquiry.reference)}`),
        "",
        `Customer: ${name}`,
        `Email: ${enquiry.customer.email}`,
        enquiry.customer.phone ? `Phone: ${enquiry.customer.phone}` : null,
        "",
        enquiry.message,
      ]
        .filter((line) => line != null)
        .join("\n"),
      start: start,
      end: new Date(start.getTime() + 15 * 60_000),
      timeZone: "Asia/Colombo",
      reminderMinutes: [5],
      colorId: "11", // red: needs a reply
      transparent: true,
    });
  } catch (error) {
    console.error("Enquiry calendar reminder failed", error);
  }
}
