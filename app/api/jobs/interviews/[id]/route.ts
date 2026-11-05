import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Division, EntityType, InterviewResult } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { formatInterviewTime, RESULT_LABELS, STAGE_LABELS } from "@/lib/jobs";
import { notifyCustomer } from "@/lib/notifications";
import { JobInterviewUpdateRequestSchema } from "@/types/dto/job";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

// Staff: record the result (passed / not passed / did not attend / cancelled)
// or move the interview to another time
export async function PUT(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "Job applications belong to the Travel division.");
    }
    const body = JobInterviewUpdateRequestSchema.parse(await request.json());
    const existing = await prisma.jobInterview.findUnique({
      where: { id: id },
      include: { application: { include: { customer: true, vacancy: true } } },
    });
    if (existing == null) {
      return notFound("Interview");
    }
    const moved = body.scheduledAt != null && body.scheduledAt.getTime() != existing.scheduledAt.getTime();
    if (moved && existing.result != InterviewResult.SCHEDULED) {
      throw new ApiError(400, "Only a scheduled interview can be moved. Add a new interview instead.");
    }

    const interview = await prisma.jobInterview.update({ where: { id: id }, data: body });

    await audit({
      userId: auth.user.id,
      action: "job_interview.updated",
      entityType: EntityType.JOB_APPLICATION,
      entityId: existing.applicationId,
      details: { interviewId: id, changedFields: Object.keys(body), result: interview.result },
    });

    const { application } = existing;
    const stage = STAGE_LABELS[interview.stage].toLowerCase();
    const job = `${application.vacancy.title} in ${application.vacancy.country}`;
    let message: string | null = null;
    if (moved) {
      message =
        `Your ${stage} for ${job} has moved to ${formatInterviewTime(interview.scheduledAt)} (Sri Lanka time).` +
        `${interview.location ? `\nPlace / link: ${interview.location}` : ""}`;
    } else if (body.result && body.result != existing.result) {
      if (body.result == InterviewResult.PASSED) {
        message = `Good news - you passed the ${stage} for ${job}. We will tell you the next step soon.`;
      } else if (body.result == InterviewResult.CANCELLED) {
        message = `Your ${stage} for ${job} on ${formatInterviewTime(existing.scheduledAt)} is cancelled. We will contact you.`;
      } else {
        message = `The result of your ${stage} for ${job}: ${RESULT_LABELS[body.result].toLowerCase()}. Our team will contact you.`;
      }
    }
    if (message) {
      await notifyCustomer({
        customer: application.customer,
        subject: `Interview update - ${application.reference}`,
        body: `Dear ${application.customer.firstName},\n\n${message}\n\nSee My account > My work visa for details.`,
        entityType: EntityType.JOB_APPLICATION,
        entityId: application.id,
      });
    }

    return NextResponse.json({ message: "Interview updated", data: interview });
  } catch (error) {
    return handleError(error);
  }
}
