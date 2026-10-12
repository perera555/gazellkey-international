import prisma from "@/lib/prisma";
import {
  EntityType,
  NotificationChannel,
  NotificationStatus,
} from "@/app/generated/prisma/enums";

// NFR-11: email/SMS go through a replaceable interface.
// To use a real provider (Resend, SendGrid, Twilio, Dialog/Mobitel SMS ...)
// write an object with this shape and call setNotificationProvider() once.
export interface NotificationProvider {
  send(message: {
    channel: NotificationChannel;
    to: string;
    subject?: string;
    body: string;
  }): Promise<void>; // throw an error if sending fails
}

const consoleProvider: NotificationProvider = {
  async send(message) {
    console.log(
      `[${message.channel}] to ${message.to}: ${message.subject ?? ""}\n${message.body}`,
    );
  },
};

let provider: NotificationProvider = consoleProvider;

export function setNotificationProvider(newProvider: NotificationProvider) {
  provider = newProvider;
}

type CustomerMessage = {
  customer: { id: string; email: string; phone: string | null };
  subject: string;
  body: string;
  entityType?: EntityType;
  entityId?: string;
};

// Sends an email (and SMS when SMS_ENABLED=true) and stores every message
// as communication history (FR-SH-09). Never throws: a failed email
// must not fail the business action that triggered it.
export async function notifyCustomer(message: CustomerMessage) {
  const channels: { channel: NotificationChannel; to: string }[] = [
    { channel: NotificationChannel.EMAIL, to: message.customer.email },
  ];
  if (process.env.SMS_ENABLED == "true" && message.customer.phone) {
    channels.push({
      channel: NotificationChannel.SMS,
      to: message.customer.phone,
    });
  }

  for (const target of channels) {
    try {
      const notification = await prisma.notification.create({
        data: {
          channel: target.channel,
          recipient: target.to,
          subject: message.subject,
          body: message.body,
          customerId: message.customer.id,
          entityType: message.entityType,
          entityId: message.entityId,
        },
      });

      try {
        await provider.send({
          channel: target.channel,
          to: target.to,
          subject: message.subject,
          body: message.body,
        });
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date() },
        });
      } catch (sendError) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.FAILED,
            error: String(sendError),
          },
        });
      }
    } catch (error) {
      console.error("Could not record notification", error);
    }
  }
}
