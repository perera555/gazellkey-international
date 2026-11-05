import {
  InterviewResult,
  InterviewStage,
  JobApplicationStatus,
  JobInterviewMode,
  PublishStatus,
} from "@/app/generated/prisma/enums";
import { todayInColombo, toDay } from "@/lib/rentals";
import { ApiError } from "@/utils/handleError";

// Overseas jobs (Travel division): vacancies abroad, applications, interviews.
//
//   website application -> APPLIED
//   staff shortlist      -> SHORTLISTED   (candidate is told)
//   interview scheduled  -> INTERVIEWING  (set automatically on the first invite)
//   employer chooses     -> SELECTED
//   medical test         -> MEDICAL       (only when needed; set automatically when booked)
//   visa, SLBFE          -> VISA_PROCESSING
//   flies out            -> DEPLOYED
//   any open step        -> REJECTED (with a reason) or WITHDRAWN (by the candidate)
// Staff decide: interviews and the medical are optional, so an application
// can go straight to SELECTED, MEDICAL or VISA_PROCESSING.

const S = JobApplicationStatus;

export const NEXT_APPLICATION_STATUSES: Record<JobApplicationStatus, JobApplicationStatus[]> = {
  APPLIED: [S.SHORTLISTED, S.SELECTED, S.MEDICAL, S.VISA_PROCESSING, S.REJECTED],
  SHORTLISTED: [S.INTERVIEWING, S.SELECTED, S.MEDICAL, S.VISA_PROCESSING, S.REJECTED],
  INTERVIEWING: [S.SELECTED, S.MEDICAL, S.VISA_PROCESSING, S.REJECTED],
  SELECTED: [S.MEDICAL, S.VISA_PROCESSING, S.REJECTED],
  MEDICAL: [S.VISA_PROCESSING, S.REJECTED],
  VISA_PROCESSING: [S.DEPLOYED, S.REJECTED],
  DEPLOYED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

// The candidate may withdraw until the visa work starts
export const WITHDRAWABLE: JobApplicationStatus[] = [S.APPLIED, S.SHORTLISTED, S.INTERVIEWING, S.SELECTED, S.MEDICAL];

// Interviews / medical can be added while the application is still open
export const INTERVIEWABLE: JobApplicationStatus[] = [S.APPLIED, S.SHORTLISTED, S.INTERVIEWING, S.SELECTED, S.MEDICAL, S.VISA_PROCESSING];

// Documents can be added while the application is open
export const DOCUMENTS_OPEN: JobApplicationStatus[] = [...INTERVIEWABLE];

export const APPLICATION_STATUS_LABELS: Record<JobApplicationStatus, string> = {
  APPLIED: "Application received",
  SHORTLISTED: "Shortlisted",
  INTERVIEWING: "Interviews",
  SELECTED: "Selected",
  MEDICAL: "Medical test",
  VISA_PROCESSING: "Visa processing",
  DEPLOYED: "Departed",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

export const STAGE_LABELS: Record<InterviewStage, string> = {
  OFFICE: "Gazellekey interview",
  EMPLOYER: "Employer interview",
  TRADE_TEST: "Trade test",
  EMBASSY: "Embassy interview",
  MEDICAL: "Medical test",
};

export const RESULT_LABELS: Record<InterviewResult, string> = {
  SCHEDULED: "Scheduled",
  PASSED: "Passed",
  FAILED: "Not passed",
  NO_SHOW: "Did not attend",
  CANCELLED: "Cancelled",
};

export const INTERVIEW_MODE_LABELS: Record<JobInterviewMode, string> = {
  WALK_IN: "Walk-in interview",
  BY_INVITATION: "By invitation (shortlisted candidates)",
  ONLINE: "Online video interview",
};

// A date/time from the admin -> that calendar day in Sri Lanka (@db.Date)
export function colomboDay(value: Date) {
  return toDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(value));
}

type Ranges = {
  salaryMin?: number | null;
  salaryMax?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

export function assertRanges(body: Ranges) {
  if (body.salaryMin != null && body.salaryMax != null && body.salaryMax < body.salaryMin) {
    throw new ApiError(400, "salaryMax: The highest salary cannot be below the lowest");
  }
  if (body.ageMin != null && body.ageMax != null && body.ageMax < body.ageMin) {
    throw new ApiError(400, "ageMax: The highest age cannot be below the lowest");
  }
}

// Published and the deadline (if any) not passed
export function isAcceptingApplications(vacancy: { status: PublishStatus; deadline: Date | null }) {
  return vacancy.status == PublishStatus.PUBLISHED && (vacancy.deadline == null || vacancy.deadline >= todayInColombo());
}

export function formatInterviewTime(date: Date) {
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

// What the candidate may see (no staff notes, no interview feedback)
export function candidateApplicationView<
  T extends { staffNotes: string | null; interviews?: { feedback: string | null; createdById: string | null }[] },
>(application: T) {
  const { staffNotes: _notes, interviews, ...visible } = application;
  void _notes;
  return {
    ...visible,
    interviews: interviews?.map(({ feedback: _feedback, createdById: _by, ...interview }) => {
      void _feedback;
      void _by;
      return interview;
    }),
  };
}
