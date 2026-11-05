import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { AppointmentMode, Division, EntityType, InterviewStage, JobApplicationStatus } from "@/app/generated/prisma/enums";
import { PRIVILEGES } from "@/lib/privileges";
import { formatInterviewTime, INTERVIEWABLE, STAGE_LABELS } from "@/lib/jobs";
import { notifyCustomer } from "@/lib/notifications";
import { JobInterviewCreateRequestSchema } from "@/types/dto/job";
import { canAccessDivision, requirePrivilege } from "@/utils/authentication";
import { ApiError, handleError, notFound } from "@/utils/handleError";
import { audit } from "@/utils/audit";
import { IdContext } from "@/utils/params";

const MODE_WORDS: Record<AppointmentMode, string> = {
  IN_PERSON: "Place",
  PHONE: "We will call you on",
  VIDEO: "Video link",
};

// Staff: invite the candidate to an interview (office, employer, trade test,
// embassy). The candidate gets an email / SMS and sees it in My account.
export async function POST(request: NextRequest, { params }: IdContext) {
  const { id } = await params;
  const auth = await requirePrivilege(request, PRIVILEGES.TRAVEL_CASES);
  if (auth.error) {
    return auth.error;
  }

  try {
    if (!canAccessDivision(auth.user, Division.TRAVEL)) {
      throw new ApiError(403, "Job applications belong to the Travel division.");
    }
    const body = JobInterviewCreateRequestSchema.parse(await request.json());
    const application = await prisma.jobApplication.findUnique({
      where: { id: id },
      include: { customer: true, vacancy: true },
    });
    if (application == null) {
      return notFound("Job application");
    }
    if (!INTERVIEWABLE.includes(application.status)) {
      throw new ApiError(400, "This application is closed. Interviews cannot be added.");
    }
    if (body.scheduledAt.getTime() < Date.now() - 60 * 60 * 1000) {
      throw new ApiError(400, "scheduledAt: Please choose a time in the future");
    }
    if (body.mode != AppointmentMode.PHONE && !body.location) {
      throw new ApiError(400, `location: Please enter the ${body.mode == AppointmentMode.VIDEO ? "video link" : "address"}`);
    }

    const interview = await prisma.$transaction(async (tx) => {
      const created = await tx.jobInterview.create({
        data: { ...body, applicationId: id, createdById: auth.user.id },
      });
      // booking moves the application on: a medical -> MEDICAL,
      // the first interview of a new / shortlisted application -> INTERVIEWING
      const S = JobApplicationStatus;
      const isMedical = body.stage == InterviewStage.MEDICAL;
      const before: JobApplicationStatus[] = isMedical ? [S.APPLIED, S.SHORTLISTED, S.INTERVIEWING, S.SELECTED] : [S.APPLIED, S.SHORTLISTED];
      if (before.includes(application.status)) {
        await tx.jobApplication.update({ where: { id: id }, data: { status: isMedical ? S.MEDICAL : S.INTERVIEWING } });
      }
      return created;
    });
    const isMedical = interview.stage == InterviewStage.MEDICAL;

    await audit({
      userId: auth.user.id,
      action: "job_interview.scheduled",
      entityType: EntityType.JOB_APPLICATION,
      entityId: id,
      details: { interviewId: interview.id, stage: interview.stage, at: interview.scheduledAt.toISOString() },
    });

    const where =
      body.mode == AppointmentMode.PHONE
        ? `${MODE_WORDS.PHONE} ${application.customer.phone ?? "your phone"}`
        : `${MODE_WORDS[body.mode]}: ${body.location}`;
    await notifyCustomer({
      customer: application.customer,
      subject: `${isMedical ? "Medical test appointment" : "Interview invitation"} - ${application.vacancy.title}, ${application.vacancy.country}`,
      body:
        `Dear ${application.customer.firstName},\n\n` +
        (isMedical
          ? `Your medical test for ${application.vacancy.title} in ${application.vacancy.country} (application ${application.reference}) is booked.\n\n`
          : `You are invited to the ${STAGE_LABELS[interview.stage].toLowerCase()} ` +
            `for ${application.vacancy.title} in ${application.vacancy.country} (application ${application.reference}).\n\n`) +
        `Date and time: ${formatInterviewTime(interview.scheduledAt)} (Sri Lanka time)\n${where}\n` +
        `${interview.interviewer ? `${isMedical ? "Medical centre" : "Interview by"}: ${interview.interviewer}\n` : ""}` +
        `${interview.instructions ? `\n${interview.instructions}\n` : ""}` +
        (isMedical
          ? `\nPlease bring your passport and passport-size photos. Follow any fasting instructions above.`
          : `\nPlease bring your passport, CV and certificates.`) +
        ` If you cannot attend, call us as soon as possible.\n\nYou can see this in My account > My work visa.`,
      entityType: EntityType.JOB_APPLICATION,
      entityId: id,
    });

    return NextResponse.json(
      { message: `${isMedical ? "Medical test booked" : "Interview scheduled"} and the candidate informed`, data: interview },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
