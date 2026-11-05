import prisma from "@/lib/prisma";
import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import {
  Division,
  DocumentAccess,
  DocumentType,
  EntityType,
  JobApplicationStatus,
} from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { findOrCreateCustomer } from "@/lib/customers";
import { approvalFor } from "@/lib/documents";
import { isAcceptingApplications } from "@/lib/jobs";
import { notifyCustomer } from "@/lib/notifications";
import { adminUrl, customerContact, smsOffice } from "@/lib/officeAlerts";
import { toDay } from "@/lib/rentals";
import { customerSummaryFields } from "@/lib/selects";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { JobApplicationCreateRequestSchema } from "@/types/dto/job";
import { canAccessDivision, getUser, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { divisionReference } from "@/utils/reference";
import { enumParam, searchParam } from "@/utils/params";
import getPageInfo, { buildPagination } from "@/utils/pageInfoRetrivel";

// Files a candidate sends with the form: field name -> document
const FILES = [
  { field: "cv", type: DocumentType.CV, title: "CV" },
  { field: "passport", type: DocumentType.PASSPORT, title: "Passport copy" },
  { field: "photo", type: DocumentType.PHOTO, title: "Passport-size photo" },
] as const;

// Guests (no account) may send a few quick applications per 10 minutes
const GUEST_WINDOW_MS = 10 * 60_000;
const GUEST_LIMIT = 5;
const guestRecent = new Map<string, number[]>();

function guestAllowed(visitor: string) {
  const now = Date.now();
  const times = (guestRecent.get(visitor) ?? []).filter((time) => now - time < GUEST_WINDOW_MS);
  const allowed = times.length < GUEST_LIMIT;
  if (allowed) times.push(now);
  guestRecent.set(visitor, times);
  if (guestRecent.size > 5000) {
    guestRecent.clear(); // keep memory bounded
  }
  return allowed;
}

// Website: apply for a job. multipart/form-data with the fields of
// JobApplicationCreateRequestSchema.
// Anyone may apply - no account needed (guests give an email and are rate
// limited). Optional files: "cv", "passport", "photo" (checked by lib/storage.ts;
// customer passport uploads wait for an admin's approval).
export async function POST(request: NextRequest) {
  const saved: string[] = [];
  try {
    const user = await getUser(request);
    const form = await request.formData();
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value == "string" && value.trim() != "" ? value : undefined;
    };
    const body = JobApplicationCreateRequestSchema.parse({
      vacancyId: text("vacancyId"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      phone: text("phone"),
      dateOfBirth: text("dateOfBirth"),
      passportNumber: text("passportNumber"),
      passportExpiry: text("passportExpiry"),
      experienceYears: text("experienceYears"),
      currentJob: text("currentJob"),
      message: text("message"),
      email: text("email"),
      website: text("website"),
    });
    if (body.website) {
      return NextResponse.json({ message: "Application received" }, { status: 201 }); // bot
    }
    if (user == null) {
      if (!body.email) {
        throw new ApiError(400, "email: Please enter your email address");
      }
      const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
      if (!guestAllowed(visitor)) {
        throw new ApiError(429, "You have sent several applications. Please wait a few minutes or call our office.");
      }
    }

    const vacancy = await prisma.jobVacancy.findUnique({ where: { id: body.vacancyId } });
    if (vacancy == null || !isAcceptingApplications(vacancy)) {
      throw new ApiError(404, "This job is no longer taking applications.");
    }

    const files = FILES.map((spec) => {
      const file = form.get(spec.field);
      return file instanceof File && file.size > 0 ? { ...spec, file: file as File } : null;
    }).filter((entry) => entry != null);

    const customer = await findOrCreateCustomer({
      email: user?.email ?? body.email!,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      userId: user?.id,
    });
    const already = await prisma.jobApplication.findUnique({
      where: { vacancyId_customerId: { vacancyId: vacancy.id, customerId: customer.id } },
    });
    if (already != null) {
      throw new ApiError(409, `You have already applied for this job (reference ${already.reference}). Our team will contact you.`);
    }

    // check and store the files before anything is written
    for (const entry of files) {
      saved.push(await saveFile(entry.file));
    }

    const application = await prisma.$transaction(async (tx) => {
      if (customer.phone == null) {
        await tx.customer.update({ where: { id: customer.id }, data: { phone: body.phone } });
      }
      const created = await tx.jobApplication.create({
        data: {
          reference: await divisionReference(Division.TRAVEL, "APP", tx),
          vacancyId: vacancy.id,
          customerId: customer.id,
          dateOfBirth: body.dateOfBirth ? toDay(body.dateOfBirth) : undefined,
          passportNumber: body.passportNumber,
          passportExpiry: body.passportExpiry ? toDay(body.passportExpiry) : undefined,
          experienceYears: body.experienceYears,
          currentJob: body.currentJob,
          message: body.message,
        },
        include: { customer: true },
      });
      for (const [index, entry] of files.entries()) {
        await tx.document.create({
          data: {
            type: entry.type,
            title: `${entry.title} - ${created.reference}`,
            fileName: entry.file.name.slice(0, 200),
            storageKey: saved[index],
            mimeType: entry.file.type,
            size: entry.file.size,
            // passports are personal: only the assigned / authorised staff
            accessLevel: entry.type == DocumentType.PASSPORT ? DocumentAccess.RESTRICTED : DocumentAccess.CUSTOMER,
            approval: approvalFor(entry.type, false),
            division: Division.TRAVEL,
            entityType: EntityType.JOB_APPLICATION,
            entityId: created.id,
            customerId: customer.id,
            uploadedById: user?.id, // empty for a guest
          },
        });
      }
      return created;
    });

    await audit({
      userId: user?.id,
      action: "job_application.created",
      entityType: EntityType.JOB_APPLICATION,
      entityId: application.id,
      details: { vacancy: vacancy.reference, files: files.map((entry) => entry.type), guest: user == null },
    });

    await notifyCustomer({
      customer: application.customer,
      subject: `Application ${application.reference} received - ${vacancy.title}, ${vacancy.country}`,
      body:
        `Dear ${application.customer.firstName},\n\nThank you for applying for ${vacancy.title} in ${vacancy.country} (job ${vacancy.reference}).\n\n` +
        `Your application reference is ${application.reference}. Our recruitment team will call you on ${body.phone} ` +
        `about the job and the documents we need. If an interview is needed we will tell you the date, time and place.\n\n` +
        (user
          ? `You can follow your application in My account > My work visa.`
          : `Create a free account on our website with this email address to follow your application and interviews online.`),
      entityType: EntityType.JOB_APPLICATION,
      entityId: application.id,
    });

    after(async () => {
      await smsOffice(
        `Gazellekey: New ${user ? "" : "quick "}job application ${application.reference} for ${vacancy.title} (${vacancy.country}). ` +
          `${customerContact(application.customer)}. Open: ${adminUrl(`/jobs/applications/${application.id}`)}`,
        EntityType.JOB_APPLICATION,
        application.id,
      );
    });

    return NextResponse.json(
      {
        message: "Application received",
        reference: application.reference,
        data: { id: application.id, reference: application.reference, status: application.status },
      },
      { status: 201 },
    );
  } catch (error) {
    for (const key of saved) {
      await deleteStoredFile(key); // nothing half-saved
    }
    return handleError(error);
  }
}

// Staff list: /api/jobs/applications?status=APPLIED&vacancyId=...&search=...
export async function GET(request: NextRequest) {
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "Job applications belong to the Travel division.");
    }
    const params = getPageInfo(request);
    const search = searchParam(request, "search");

    const where: Prisma.JobApplicationWhereInput = {
      status: enumParam(request, "status", JobApplicationStatus),
      vacancyId: searchParam(request, "vacancyId"),
      OR: search
        ? [
            { reference: { contains: search, mode: "insensitive" } },
            { passportNumber: { contains: search, mode: "insensitive" } },
            { vacancy: { title: { contains: search, mode: "insensitive" } } },
            { vacancy: { country: { contains: search, mode: "insensitive" } } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
            { customer: { firstName: { contains: search, mode: "insensitive" } } },
            { customer: { lastName: { contains: search, mode: "insensitive" } } },
            { customer: { phone: { contains: search } } },
          ]
        : undefined,
    };

    const [applications, totalCount] = await Promise.all([
      prisma.jobApplication.findMany({
        where: where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: customerSummaryFields },
          vacancy: { select: { id: true, reference: true, title: true, country: true } },
          interviews: { orderBy: { scheduledAt: "asc" } },
        },
      }),
      prisma.jobApplication.count({ where: where }),
    ]);

    return NextResponse.json({
      message: "Job applications fetched successfully",
      data: applications,
      pagination: buildPagination(params, totalCount),
    });
  } catch (error) {
    return handleError(error);
  }
}
