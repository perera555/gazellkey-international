// Sample overseas job vacancies for the website's Jobs abroad page (Travel
// division): Middle East and the rest of the world, with announced interviews.
// Safe to run again: vacancies are matched by slug and only added when missing,
// so changes made in the admin portal are kept.
//   npm run seed:jobs
// Edit them in the admin portal (Catalogue > Job vacancies).
// Salaries, dates and employers are EXAMPLES - change or archive them before going live.
import "dotenv/config";
import prisma from "../lib/prisma";
import { JobInterviewMode, PublishStatus } from "../app/generated/prisma/enums";

type Vacancy = {
  slug: string;
  title: string;
  category: string;
  country: string;
  region: string;
  city?: string;
  employer?: string;
  positions: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  contractMonths?: number;
  visaType?: string;
  description: string;
  requirements: string[];
  benefits: string[];
  documentsNeeded?: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  experienceYears?: number;
  interviewMode?: JobInterviewMode;
  interviewAt?: string; // Sri Lanka time
  interviewPlace?: string;
  interviewNotes?: string;
  deadline?: string;
  featured?: boolean;
};

const OFFICE = "Gazellekey International head office";
const STANDARD_DOCUMENTS = [
  "Passport (at least 2 years valid)",
  "CV with a phone number",
  "4 passport-size photos (white background)",
  "Copies of certificates and service letters",
];

const VACANCIES: Vacancy[] = [
  // ── Middle East ──
  {
    slug: "uae-hotel-waiter", title: "Hotel Waiter / Waitress", category: "Hospitality",
    country: "United Arab Emirates", region: "Middle East", city: "Dubai", employer: "5-star hotel group",
    positions: 25, salaryMin: 1500, salaryMax: 2000, salaryCurrency: "AED", contractMonths: 24,
    visaType: "Employment visa, 2 years, renewable", featured: true,
    description: "Serve guests in the hotel's restaurants, banquets and room service. Training is given on arrival. Service charge and tips are paid on top of the salary.",
    requirements: ["1 year hotel or restaurant experience", "Basic spoken English", "Neat appearance", "Height at least 5 ft 4 in"],
    benefits: ["Free shared accommodation", "Three meals on duty", "Free transport to work", "Medical insurance", "Air ticket every 2 years", "30 days paid leave per year"],
    documentsNeeded: STANDARD_DOCUMENTS, ageMin: 21, ageMax: 35, experienceYears: 1,
    interviewMode: JobInterviewMode.WALK_IN, interviewAt: "2026-11-21T09:00:00+05:30", interviewPlace: OFFICE,
    interviewNotes: "Walk-in interview with the hotel's HR manager. Come in neat dress with your passport and CV. Interviews start at 9.00 am.",
    deadline: "2026-11-20",
  },
  {
    slug: "qatar-heavy-vehicle-driver", title: "Heavy Vehicle Driver", category: "Driving",
    country: "Qatar", region: "Middle East", city: "Doha", employer: "Construction and logistics company",
    positions: 15, salaryMin: 2500, salaryMax: 3200, salaryCurrency: "QAR", contractMonths: 24,
    visaType: "Work residence permit, 2 years", featured: true,
    description: "Drive trailers and tipper trucks between sites in and around Doha. A Qatar licence is arranged by the employer after arrival.",
    requirements: ["Valid Sri Lankan heavy vehicle licence", "3 years heavy vehicle experience", "GCC experience is an advantage"],
    benefits: ["Free accommodation", "Food allowance", "Overtime paid", "Medical insurance", "Annual air ticket"],
    documentsNeeded: [...STANDARD_DOCUMENTS, "Driving licence (front and back)"], ageMin: 25, ageMax: 45, experienceYears: 3, gender: "Male",
    interviewMode: JobInterviewMode.BY_INVITATION, interviewAt: "2026-11-28T08:30:00+05:30", interviewPlace: OFFICE,
    interviewNotes: "Shortlisted candidates are called for a driving trade test and an interview with the employer.",
    deadline: "2026-11-25",
  },
  {
    slug: "saudi-construction-mason", title: "Mason / Tile Fixer", category: "Construction",
    country: "Saudi Arabia", region: "Middle East", city: "Riyadh",
    positions: 40, salaryMin: 1800, salaryMax: 2400, salaryCurrency: "SAR", contractMonths: 24,
    visaType: "Work visa (iqama), 2 years",
    description: "Block work, plastering and tiling on housing and commercial projects. A trade test is part of the selection.",
    requirements: ["2 years experience as a mason or tile fixer", "Trade test at the interview", "Physically fit"],
    benefits: ["Free accommodation", "Free transport", "Overtime paid", "Medical cover", "Air ticket every 2 years"],
    documentsNeeded: STANDARD_DOCUMENTS, ageMin: 22, ageMax: 45, experienceYears: 2, gender: "Male",
    interviewMode: JobInterviewMode.WALK_IN, interviewAt: "2026-12-05T08:00:00+05:30", interviewPlace: OFFICE,
    interviewNotes: "Walk-in interview and trade test. Bring your work gloves.",
    deadline: "2026-12-04",
  },
  {
    slug: "kuwait-housemaid", title: "Housemaid", category: "Domestic work",
    country: "Kuwait", region: "Middle East", city: "Kuwait City",
    positions: 30, salaryMin: 120, salaryMax: 120, salaryCurrency: "KWD", contractMonths: 24,
    visaType: "Domestic worker visa (Article 20), 2 years",
    description: "Housekeeping, laundry and helping with cooking for a family. Families are checked by our partner agency in Kuwait.",
    requirements: ["SLBFE NVQ housekeeping training certificate", "Previous experience is an advantage"],
    benefits: ["Free food and accommodation with the family", "Medical cover", "Return air ticket", "One day off per week"],
    documentsNeeded: [...STANDARD_DOCUMENTS, "SLBFE training certificate", "Family background report"], ageMin: 25, ageMax: 45, gender: "Female",
    interviewMode: JobInterviewMode.BY_INVITATION, interviewPlace: OFFICE,
    interviewNotes: "Candidates are called for an interview after the documents are checked.",
  },
  {
    slug: "oman-staff-nurse", title: "Staff Nurse", category: "Healthcare",
    country: "Oman", region: "Middle East", city: "Muscat", employer: "Private hospital",
    positions: 10, salaryMin: 450, salaryMax: 650, salaryCurrency: "OMR", contractMonths: 24,
    visaType: "Employment visa, 2 years",
    description: "Ward and outpatient nursing in a private multi-specialty hospital. Oman Ministry of Health licensing is supported.",
    requirements: ["Diploma or BSc in Nursing", "Sri Lanka Nursing Council registration", "2 years hospital experience", "Good English"],
    benefits: ["Furnished accommodation or allowance", "Transport", "Medical cover", "Annual air ticket", "End-of-service benefit"],
    documentsNeeded: [...STANDARD_DOCUMENTS, "Nursing registration", "Degree / diploma certificate"], ageMin: 23, ageMax: 40, experienceYears: 2,
    interviewMode: JobInterviewMode.ONLINE, interviewAt: "2026-12-10T14:00:00+05:30",
    interviewPlace: "Video interview with the hospital (link sent to shortlisted candidates)",
    deadline: "2026-12-03",
  },
  // ── Rest of the world ──
  {
    slug: "japan-care-worker", title: "Care Worker (Specified Skilled Worker)", category: "Healthcare",
    country: "Japan", region: "Asia", city: "Osaka",
    positions: 12, salaryMin: 180000, salaryMax: 220000, salaryCurrency: "JPY", contractMonths: 36,
    visaType: "Specified Skilled Worker (i) visa", featured: true,
    description: "Care for elderly residents in a nursing home. You need to pass the Japanese language test and the nursing care skills test before the visa.",
    requirements: ["JLPT N4 or JFT-Basic pass", "Nursing care skills test pass (we help you prepare)", "Caring nature"],
    benefits: ["Japanese social insurance", "Housing support", "Overtime and night shift allowances", "Paid annual leave"],
    documentsNeeded: [...STANDARD_DOCUMENTS, "Japanese language test result"], ageMin: 20, ageMax: 38,
    interviewMode: JobInterviewMode.ONLINE, interviewAt: "2026-12-12T10:00:00+05:30",
    interviewPlace: "Online interview with the employer in Japan",
    deadline: "2026-12-06",
  },
  {
    slug: "romania-factory-worker", title: "Factory Worker", category: "Manufacturing",
    country: "Romania", region: "Europe", city: "Timisoara",
    positions: 20, salaryMin: 700, salaryMax: 900, salaryCurrency: "EUR", contractMonths: 24,
    visaType: "Long-stay work visa (D/AM) and residence permit",
    description: "Production line work in an automotive parts factory: assembling, packing and quality checks. Shift work.",
    requirements: ["Factory experience is an advantage", "Basic English", "Ready for shift work"],
    benefits: ["Accommodation provided", "Overtime paid", "Health insurance", "Legal work permit"],
    documentsNeeded: [...STANDARD_DOCUMENTS, "Police clearance certificate"], ageMin: 21, ageMax: 40,
    interviewMode: JobInterviewMode.BY_INVITATION, interviewAt: "2026-11-30T10:00:00+05:30", interviewPlace: OFFICE,
    interviewNotes: "Shortlisted candidates meet the employer's agent. An embassy interview follows for selected candidates.",
    deadline: "2026-11-27",
  },
  {
    slug: "maldives-resort-cook", title: "Resort Cook (Commis / Demi Chef)", category: "Hospitality",
    country: "Maldives", region: "Asia", employer: "Island resort",
    positions: 6, salaryMin: 600, salaryMax: 900, salaryCurrency: "USD", contractMonths: 12,
    visaType: "Work visa, 1 year, renewable",
    description: "Prepare Asian and Western dishes for the resort's restaurants. Island life with staff accommodation on the resort.",
    requirements: ["Culinary certificate", "2 years kitchen experience in a hotel", "Good hygiene practice"],
    benefits: ["Free food and accommodation", "Service charge", "Annual air ticket", "Medical cover"],
    documentsNeeded: STANDARD_DOCUMENTS, ageMin: 21, ageMax: 40, experienceYears: 2,
    interviewMode: JobInterviewMode.WALK_IN, interviewAt: "2026-11-19T10:00:00+05:30", interviewPlace: OFFICE,
    interviewNotes: "Walk-in interview with the resort's executive chef. A short cooking test may be given.",
    deadline: "2026-11-18",
  },
];

// Same format as utils/reference.ts: TRV-JOB-2026-00001
async function nextJobReference() {
  const key = `TRV-JOB-${new Date().getFullYear()}`;
  const counter = await prisma.counter.upsert({
    where: { key: key },
    create: { key: key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(5, "0")}`;
}

async function main() {
  let added = 0;
  for (const vacancy of VACANCIES) {
    const existing = await prisma.jobVacancy.findUnique({ where: { slug: vacancy.slug } });
    if (existing) {
      continue;
    }
    await prisma.jobVacancy.create({
      data: {
        ...vacancy,
        reference: await nextJobReference(),
        documentsNeeded: vacancy.documentsNeeded ?? STANDARD_DOCUMENTS,
        interviewAt: vacancy.interviewAt ? new Date(vacancy.interviewAt) : undefined,
        deadline: vacancy.deadline ? new Date(`${vacancy.deadline}T00:00:00Z`) : undefined,
        status: PublishStatus.PUBLISHED,
      },
    });
    added++;
  }
  console.log(`Job vacancies: ${added} added, ${VACANCIES.length - added} already there.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
