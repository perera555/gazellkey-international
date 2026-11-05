import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType, JobApplicationStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { isRecordOwner } from "@/lib/access";
import {
  candidateApplicationView,
  INTERVIEWABLE,
  NEXT_APPLICATION_STATUSES,
  WITHDRAWABLE,
} from "@/lib/jobs";
import { notifyCustomer } from "@/lib/notifications";
import { JobApplicationUpdateRequestSchema } from "@/types/dto/job";
import { RequestUserType } from "@/types/requestUser";
import { canAccessDivision, hasPrivilege, requireUser } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

const S = JobApplicationStatus;

const include = {
  customer: true,
  vacancy: true,
  interviews: { orderBy: { scheduledAt: "asc" as const } },
};

function isJobsStaff(user: RequestUserType) {
  return hasPrivilege(user, PRIVILEGES.TRAVEL_CASES) && canAccessDivision(user, Division.TRAVEL);
}

function staffView<T extends { status: JobApplicationStatus }>(application: T) {
  return {
    ...application,
    nextStatuses: NEXT_APPLICATION_STATUSES[application.status],
    canInterview: INTERVIEWABLE.includes(application.status),
  };
}

// Staff (travel:cases, Travel division) or the candidate it belongs to
export async function GET(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const application = await prisma.jobApplication.findUnique({ where: { id: id }, include: include });
    if (application == null) {
      return notFound("Job application");
    }
    if (isJobsStaff(auth.user)) {
      return NextResponse.json({ message: "Job application fetched", data: staffView(application) });
    }
    if (!(await isRecordOwner(auth.user, application))) {
      return notFound("Job application");
    }
    return NextResponse.json({
      message: "Job application fetched",
      data: { ...candidateApplicationView(application), canWithdraw: WITHDRAWABLE.includes(application.status) },
    });
  } catch (error) {
    return handleError(error);
  }
}

// Staff: move the application along, notes. Candidate: { status: "WITHDRAWN" } only.
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = JobApplicationUpdateRequestSchema.parse(await request.json());
    const existing = await prisma.jobApplication.findUnique({ where: { id: id }, include: include });
    if (existing == null) {
      return notFound("Job application");
    }
    const staff = isJobsStaff(auth.user);

    if (!staff) {
      if (!(await isRecordOwner(auth.user, existing))) {
        return notFound("Job application");
      }
      if (body.status != S.WITHDRAWN || body.staffNotes !== undefined) {
        throw new ApiError(403, "You can only withdraw your application.");
      }
      if (!WITHDRAWABLE.includes(existing.status)) {
        throw new ApiError(400, "This application can no longer be withdrawn. Please call our office.");
      }
      await prisma.$transaction([
        prisma.jobApplication.update({ where: { id: id }, data: { status: S.WITHDRAWN } }),
        prisma.jobInterview.updateMany({ where: { applicationId: id, result: "SCHEDULED" }, data: { result: "CANCELLED" } }),
      ]);
      await audit({
        userId: auth.user.id,
        action: "job_application.withdrawn",
        entityType: EntityType.JOB_APPLICATION,
        entityId: id,
        details: { from: existing.status },
      });
      const application = await prisma.jobApplication.findUniqueOrThrow({ where: { id: id }, include: include });
      return NextResponse.json({
        message: "Application withdrawn",
        data: { ...candidateApplicationView(application), canWithdraw: false },
      });
    }

    const status = body.status ?? existing.status;
    const changed = status != existing.status;
    if (changed && !NEXT_APPLICATION_STATUSES[existing.status].includes(status)) {
      throw new ApiError(400, `An application that is ${existing.status.toLowerCase()} cannot be changed to ${status.toLowerCase()}.`);
    }
    if (changed && status == S.REJECTED && !body.rejectReason) {
      throw new ApiError(400, "rejectReason: please give a short reason - the candidate sees it");
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: id },
        data: {
          status: status,
          staffNotes: body.staffNotes,
          rejectReason: changed && status == S.REJECTED ? body.rejectReason : undefined,
        },
      });
      if (changed && status == S.REJECTED) {
        await tx.jobInterview.updateMany({ where: { applicationId: id, result: "SCHEDULED" }, data: { result: "CANCELLED" } });
      }
    });
    const application = await prisma.jobApplication.findUniqueOrThrow({ where: { id: id }, include: include });

    if (changed) {
      await audit({
        userId: auth.user.id,
        action: "job_application.status_changed",
        entityType: EntityType.JOB_APPLICATION,
        entityId: id,
        details: { from: existing.status, to: status, reason: body.rejectReason ?? null },
      });

      const message = statusMessage(status, application.vacancy, body.rejectReason);
      if (message) {
        await notifyCustomer({
          customer: application.customer,
          subject: `${message.subject} - ${application.reference}`,
          body: `Dear ${application.customer.firstName},\n\n${message.body}\n\nYou can follow your application in My account > My work visa.`,
          entityType: EntityType.JOB_APPLICATION,
          entityId: id,
        });
      }
    }

    return NextResponse.json({ message: "Job application updated", data: staffView(application) });
  } catch (error) {
    return handleError(error);
  }
}

function statusMessage(status: JobApplicationStatus, vacancy: { title: string; country: string }, reason?: string) {
  const job = `${vacancy.title} in ${vacancy.country}`;
  switch (status) {
    case S.SHORTLISTED:
      return {
        subject: "You are shortlisted",
        body: `Good news - you are shortlisted for ${job}. We will send you the interview date, time and place soon.`,
      };
    case S.SELECTED:
      return {
        subject: "You are selected",
        body: `Congratulations - you are selected for ${job}. Our team will call you about the medical, the visa documents and the next steps.`,
      };
    case S.MEDICAL:
      return {
        subject: "Next step: medical test",
        body: `The next step for ${job} is a medical test. We will send you the date, time and the medical centre.`,
      };
    case S.VISA_PROCESSING:
      return {
        subject: "Your work visa is being processed",
        body: `We have started your work visa for ${job}. We will tell you when the visa is ready and when to collect your ticket.`,
      };
    case S.DEPLOYED:
      return {
        subject: "Have a safe journey",
        body: `Your file for ${job} is complete. We wish you a safe journey and every success in your new job.`,
      };
    case S.REJECTED:
      return {
        subject: "Your application",
        body: `Thank you for applying for ${job}. This time you were not selected.${reason ? `\nReason: ${reason}` : ""}\n\nPlease apply for our other vacancies.`,
      };
    default:
      return null;
  }
}
