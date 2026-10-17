// Sample hotels for the website's Hotels page (/hotels). Names and prices
// are examples - replace them with the hotels you work with in the admin
// portal (Catalogue > Hotels). Safe to run again: hotels are matched by slug.
//   npm run seed:hotels
import "dotenv/config";
import prisma from "../lib/prisma";
import { PricingMode, PublishStatus } from "../app/generated/prisma/enums";

type SampleHotel = {
  slug: string;
  name: string;
  city: string;
  country: string;
  starRating: number;
  address?: string;
  summary: string;
  facilities: string[];
  roomTypes: string[];
  price?: number; // "from" price per night
  currency?: string;
};

const HOTELS: SampleHotel[] = [
  {
    slug: "galle-fort-heritage-hotel", name: "Galle Fort Heritage Hotel", city: "Galle", country: "Sri Lanka", starRating: 5,
    address: "Church Street, Galle Fort",
    summary: "A restored Dutch colonial mansion inside the UNESCO-listed Galle Fort, steps from the ramparts, cafés and the lighthouse.",
    facilities: ["Free Wi-Fi", "Swimming pool", "Spa", "Breakfast included", "Airport transfer on request"],
    roomTypes: ["Heritage double (2 guests)", "Ocean-view suite (2 guests)", "Family room (4 guests)"],
    price: 68000, currency: "LKR",
  },
  {
    slug: "kandy-lake-view-hotel", name: "Kandy Lake View Hotel", city: "Kandy", country: "Sri Lanka", starRating: 4,
    summary: "Hill-side hotel overlooking Kandy Lake, a short walk from the Temple of the Tooth. Ideal for cultural-triangle tours.",
    facilities: ["Free Wi-Fi", "Restaurant", "Breakfast included", "Free parking"],
    roomTypes: ["Deluxe double - lake view (2 guests)", "Twin room (2 guests)", "Triple room (3 guests)"],
    price: 32000, currency: "LKR",
  },
  {
    slug: "ella-rock-mountain-lodge", name: "Ella Rock Mountain Lodge", city: "Ella", country: "Sri Lanka", starRating: 3,
    summary: "Cosy eco-lodge among tea gardens with views of Ella Gap. Close to Nine Arches Bridge and Little Adam's Peak.",
    facilities: ["Free Wi-Fi", "Mountain view", "Breakfast included", "Hiking guides"],
    roomTypes: ["Garden cabana (2 guests)", "Mountain-view chalet (3 guests)"],
    price: 18500, currency: "LKR",
  },
  {
    slug: "sigiriya-jungle-resort", name: "Sigiriya Jungle Resort", city: "Sigiriya", country: "Sri Lanka", starRating: 4,
    summary: "Villas set in a private forest with views of Sigiriya Rock. Elephant safaris to Minneriya can be arranged.",
    facilities: ["Swimming pool", "Spa", "Restaurant", "Safari bookings", "Free Wi-Fi"],
    roomTypes: ["Forest villa (2 guests)", "Pool villa (2 guests)", "Family villa (4 guests)"],
    price: 45000, currency: "LKR",
  },
  {
    slug: "colombo-city-business-hotel", name: "Colombo City Business Hotel", city: "Colombo", country: "Sri Lanka", starRating: 4,
    address: "Galle Road, Colombo 03",
    summary: "Modern hotel in the heart of Colombo, close to shopping and the Galle Face Green. Meeting rooms for business travellers.",
    facilities: ["Free Wi-Fi", "Rooftop pool", "Gym", "Meeting rooms", "Airport transfer on request"],
    roomTypes: ["Superior king (2 guests)", "Executive room (2 guests)"],
    price: 36000, currency: "LKR",
  },
  {
    slug: "maldives-lagoon-water-villas", name: "Maldives Lagoon Water Villas", city: "South Malé Atoll", country: "Maldives", starRating: 5,
    summary: "Over-water villas on a private island, reached by speedboat from Malé. All-inclusive and honeymoon packages available.",
    facilities: ["Over-water villas", "All-inclusive option", "Snorkelling", "Spa", "Speedboat transfer"],
    roomTypes: ["Beach villa (2 guests)", "Water villa with pool (2 guests)"],
    price: 520, currency: "USD",
  },
  {
    slug: "dubai-marina-hotel", name: "Dubai Marina Hotel", city: "Dubai", country: "United Arab Emirates", starRating: 4,
    summary: "Stylish hotel by Dubai Marina, close to the beach, metro and shopping malls.",
    facilities: ["Free Wi-Fi", "Pool", "Gym", "Metro nearby"],
    roomTypes: ["Deluxe king (2 guests)", "Marina-view room (2 guests)"],
    price: 140, currency: "USD",
  },
  {
    slug: "singapore-orchard-hotel", name: "Singapore Orchard Hotel", city: "Singapore", country: "Singapore", starRating: 4,
    summary: "Central hotel on Orchard Road - shopping, Gardens by the Bay and Marina Bay are a short ride away. Price on request.",
    facilities: ["Free Wi-Fi", "Pool", "Restaurant", "Family rooms"],
    roomTypes: ["Deluxe double (2 guests)", "Family room (4 guests)"],
  },
];

async function main() {
  for (const hotel of HOTELS) {
    const { price, currency, ...rest } = hotel;
    const data = {
      ...rest,
      pricingMode: price != undefined ? PricingMode.FIXED : PricingMode.ON_REQUEST,
      price: price ?? null,
      currency: price != undefined ? currency : null,
      status: PublishStatus.PUBLISHED,
    };
    await prisma.hotel.upsert({ where: { slug: hotel.slug }, create: data, update: data });
    console.log(`✓ ${hotel.name}, ${hotel.city}`);
  }
  console.log(`\n${HOTELS.length} hotels are published.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
