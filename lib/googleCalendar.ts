import * as jose from "jose";

// Google Calendar through a service account (no extra npm package).
//
// Setup (once):
//   1. Google Cloud console -> enable "Google Calendar API"
//   2. IAM -> Service accounts -> create one -> Keys -> add a JSON key
//   3. In Google Calendar, share the company calendar with the service
//      account's email and give it "Make changes to events"
//   4. Put these in .env:
//        GOOGLE_CALENDAR_ID            (calendar settings -> "Calendar ID")
//        GOOGLE_SERVICE_ACCOUNT_EMAIL  (client_email from the JSON key)
//        GOOGLE_PRIVATE_KEY            (private_key from the JSON key, with \n)
//
// When these are missing the calendar is simply switched off: appointments
// still work, they are just not copied to Google Calendar.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";

export type CalendarEvent = {
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
  timeZone: string;
  appointmentId: string;
};

function config() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!calendarId || !email || !privateKey) {
    return null;
  }
  return { calendarId, email, privateKey };
}

export function isCalendarEnabled() {
  return config() != null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

// OAuth access token from a signed JWT (service account flow), cached
// until a minute before it expires.
async function getAccessToken() {
  const settings = config()!;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const key = await jose.importPKCS8(settings.privateKey, "RS256");
  const assertion = await new jose.SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(settings.email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Google sign-in failed: ${body.error_description ?? body.error ?? response.status}`,
    );
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.value;
}

async function googleRequest(method: string, path: string, body?: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: method,
    headers: {
      authorization: `Bearer ${await getAccessToken()}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status == 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `Google Calendar error ${response.status}: ${data.error?.message ?? "unknown"}`,
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data;
}

function eventsPath(eventId?: string) {
  const calendar = encodeURIComponent(config()!.calendarId);
  return `/calendars/${calendar}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}

function toGoogleEvent(event: CalendarEvent) {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location ?? undefined,
    start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
    end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
    extendedProperties: { private: { appointmentId: event.appointmentId } },
    reminders: { useDefault: true },
  };
}

// Creates the event, or updates it when it already exists.
// Returns Google's event id and the link that opens it in Google Calendar.
export async function saveCalendarEvent(
  event: CalendarEvent,
  existingEventId?: string | null,
): Promise<{ id: string; htmlLink: string }> {
  if (existingEventId) {
    try {
      const updated = await googleRequest(
        "PATCH",
        eventsPath(existingEventId),
        toGoogleEvent(event),
      );
      return { id: updated.id, htmlLink: updated.htmlLink };
    } catch (error) {
      // deleted by hand in Google Calendar -> create it again below
      const status = (error as { status?: number }).status;
      if (status != 404 && status != 410) {
        throw error;
      }
    }
  }
  const created = await googleRequest("POST", eventsPath(), toGoogleEvent(event));
  return { id: created.id, htmlLink: created.htmlLink };
}

export async function deleteCalendarEvent(eventId: string) {
  try {
    await googleRequest("DELETE", eventsPath(eventId));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status != 404 && status != 410) {
      throw error; // already gone is fine
    }
  }
}

type GoogleEventTime = { dateTime?: string; date?: string };

// Busy periods added by hand in the company calendar (holidays, staff leave,
// other meetings ...) so the website does not offer those times.
// Events created for appointments are skipped - the database already knows
// those, and one division's meeting must not block the other divisions.
export async function getBusyTimes(from: Date, to: Date, utcOffset: string) {
  const query = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    maxResults: "250",
  });
  const data = await googleRequest("GET", `${eventsPath()}?${query}`);
  const events: {
    status?: string;
    transparency?: string;
    start: GoogleEventTime;
    end: GoogleEventTime;
    extendedProperties?: { private?: { appointmentId?: string } };
  }[] = data.items ?? [];

  return events
    .filter(
      (event) =>
        event.status != "cancelled" &&
        event.transparency != "transparent" && // "show as free"
        !event.extendedProperties?.private?.appointmentId,
    )
    .map((event) => ({
      // all-day events (a public holiday) have a local "date", no time
      start: new Date(event.start.dateTime ?? `${event.start.date}T00:00:00${utcOffset}`),
      end: new Date(event.end.dateTime ?? `${event.end.date}T00:00:00${utcOffset}`),
    }));
}
