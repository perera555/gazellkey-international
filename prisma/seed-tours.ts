// Tour packages added by script: the 14-day Dambadiva (Dambadiwa) pilgrimage
// plus sample outbound and Sri Lanka tours, all with photos.
// Shown on the website's Travel page and at /travel/{slug}. Edit the price,
// dates and details in the admin portal (Catalogue > Tour packages).
// Safe to run again: tours are matched by slug and only created when missing,
// so changes made in the admin are kept. A tour without photos gets them.
//   npm run seed:tours
import "dotenv/config";
import prisma from "../lib/prisma";
import { Prisma } from "../app/generated/prisma/client";
import { PricingMode, PublishStatus, TourType } from "../app/generated/prisma/enums";

// Unsplash photo (free licence; Unsplash serves the image itself).
// Sample photos only - replace with your own when you have them.
const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=1600&q=80&auto=format&fit=crop`;

const PHOTOS = {
  varanasi: unsplash("photo-1571536802807-30451e3955d8"),
  tajMahal: unsplash("photo-1564507592333-c60657eea523"),
  phiPhi: unsplash("photo-1552465011-b4e21bf6e79a"),
  phangNga: unsplash("photo-1609137144813-7d9921338f24"),
  bangkok: unsplash("photo-1508009603885-50cf7c579365"),
  marinaBay: unsplash("photo-1525625293386-3f8f99389edd"),
  maldivesAtoll: unsplash("photo-1514282401047-d79a71a590e8"),
  maldivesVilla: unsplash("photo-1540202404-a2f29016b523"),
  dubaiSkyline: unsplash("photo-1512453979798-5ea266f8880c"),
  burjAlArab: unsplash("photo-1518684079-3c830dcef090"),
  fuji: unsplash("photo-1490806843957-31f4c9a91c65"),
  kyoto: unsplash("photo-1493976040374-85c8e12f0c0e"),
  baliTemple: unsplash("photo-1537996194471-e657df975ab4"),
  baliRice: unsplash("photo-1555400038-63f5ba517a47"),
  nineArch: unsplash("photo-1566296314736-6eaac1ca0cb9"),
  sigiriya: unsplash("photo-1588598198321-9735fd52455b"),
  leopard: unsplash("photo-1456926631375-92c8ce872def"),
  // site photography in the website's /public/images
  thailand: "/images/travel-thailand.jpg",
  singapore: "/images/travel-singapore.jpg",
  maldives: "/images/travel-maldives.jpg",
  ella: "/images/travel-ella.jpg",
  sigiriyaSite: "/images/travel-sigiriya.jpg",
};

const DAMBADIVA = {
  slug: "dambadiva-pilgrimage-14-days",
  title: "Dambadiva Vandana Pilgrimage - 14 Days",
  tourType: TourType.OUTBOUND,
  destination: "Dambadiva (India & Nepal)",
  country: "India",
  summary:
    "A 14-day Buddhist pilgrimage to the sacred land of the Buddha - all four great places of worship (Lumbini, Bodh Gaya, " +
    "Sarnath and Kushinagar) together with Rajgir, Nalanda, Vaishali, Kapilavastu and Sravasti. Led by an experienced " +
    "Sri Lankan tour guide, with Sri Lankan vegetarian meals, comfortable air-conditioned transport and time for " +
    "pooja and meditation at every sacred site.",
  durationDays: 14,
  isCustomisable: true,
  minGroupSize: 20,
  maxGroupSize: 45,
  itinerary: [
    { day: 1, title: "Colombo to Varanasi", description: "Fly from Colombo to Varanasi. Meet our guide and transfer to the hotel. Evening at leisure and pooja." },
    { day: 2, title: "Sarnath - the First Sermon", description: "Isipatana (Sarnath): Dhamek Stupa, Mulagandhakuti Vihara and the Deer Park where the Buddha preached the Dhammacakkappavattana Sutta. Evening Ganga aarti in Varanasi." },
    { day: 3, title: "Varanasi to Bodh Gaya", description: "Drive to Bodh Gaya (about 6 hours). Evening visit to the Maha Bodhi Temple and the Jaya Sri Maha Bodhi." },
    { day: 4, title: "Bodh Gaya - the Enlightenment", description: "Full day at the Maha Bodhi Temple: Vajrasana, Animisa Lochana, Ratana Chankamana and the other Sathi Sathi sacred places. Bodhi pooja and night meditation." },
    { day: 5, title: "Rajgir and Nalanda", description: "Gijjakuta (Vulture's Peak), Veluvanaramaya and Jivaka's mango grove in Rajgir, then the ruins of the ancient Nalanda University." },
    { day: 6, title: "Vaishali", description: "Drive to Vaishali: Kutagarasala, the Ananda Stupa and the Ashoka pillar. Overnight near Vaishali." },
    { day: 7, title: "Kesariya to Kushinagar", description: "Visit the great Kesariya Stupa, then continue to Kushinagar. Evening pooja." },
    { day: 8, title: "Kushinagar - the Parinibbana", description: "Mahaparinirvana Temple with the reclining Buddha statue and the Ramabhar (Makutabandhana) Stupa. Afternoon drive across the border to Lumbini, Nepal." },
    { day: 9, title: "Lumbini - the Birth", description: "Maya Devi Temple, the sacred pond and the Ashoka pillar marking the birthplace of the Buddha. Visit the monasteries of the Lumbini development zone." },
    { day: 10, title: "Kapilavastu to Sravasti", description: "Kapilavastu (Tilaurakot / Piprahwa), the kingdom of King Suddhodana, then drive to Sravasti." },
    { day: 11, title: "Sravasti - Jetavanaramaya", description: "Jetavanaramaya where the Buddha spent 19 rainy seasons, Ananda Bodhi, Pubbaramaya, Angulimala's cave and the site of the Twin Miracle." },
    { day: 12, title: "Sravasti to Lucknow and Delhi", description: "Drive to Lucknow and travel on to Delhi (flight or train)." },
    { day: 13, title: "Delhi", description: "Delhi sightseeing and the National Museum's sacred relics of the Buddha (when open). Time for shopping. Optional day trip to Agra and the Taj Mahal." },
    { day: 14, title: "Delhi to Colombo", description: "Morning at leisure, then transfer to the airport for the flight home to Colombo." },
  ],
  inclusions: [
    "Return air tickets (Colombo - India - Colombo)",
    "Hotels and pilgrim rest houses on twin sharing",
    "All meals - Sri Lankan vegetarian food",
    "Air-conditioned coach for the whole tour",
    "Experienced Sri Lankan tour guide",
    "Entrance fees at the sacred sites",
    "Pooja items and flowers",
    "Indian visa and Nepal entry assistance",
  ],
  exclusions: [
    "Visa fees",
    "Travel insurance (we can arrange it)",
    "Single room supplement",
    "Tips and personal expenses",
    "Optional Agra / Taj Mahal excursion",
  ],
  departureDates: ["2026-11-14", "2026-12-12", "2027-01-16", "2027-02-13", "2027-03-13"].map((date) => new Date(`${date}T00:00:00Z`)),
  pricingMode: PricingMode.ON_REQUEST, // set your package price in the admin portal
  images: [PHOTOS.varanasi, PHOTOS.tajMahal],
  status: PublishStatus.PUBLISHED,
};

type Day = [title: string, description: string];

// Sample tours: "from" price per person in LKR, twin sharing
function tour(data: {
  slug: string;
  title: string;
  tourType: TourType;
  destination: string;
  country: string;
  summary: string;
  days: Day[];
  inclusions: string[];
  exclusions?: string[];
  departures: string[];
  price: number;
  images: string[];
}): Prisma.TourPackageCreateInput {
  return {
    slug: data.slug,
    title: data.title,
    tourType: data.tourType,
    destination: data.destination,
    country: data.country,
    summary: data.summary,
    durationDays: data.days.length,
    itinerary: data.days.map(([title, description], index) => ({ day: index + 1, title, description })),
    departureDates: data.departures.map((date) => new Date(`${date}T00:00:00Z`)),
    isCustomisable: true,
    minGroupSize: 2,
    inclusions: data.inclusions,
    exclusions: data.exclusions ?? ["Visa fees", "Travel insurance (we can arrange it)", "Tips and personal expenses"],
    pricingMode: PricingMode.FIXED,
    price: data.price,
    currency: "LKR",
    images: data.images,
    status: PublishStatus.PUBLISHED,
  };
}

const { OUTBOUND, INBOUND } = TourType;

const SAMPLE_TOURS = [
  tour({
    slug: "thailand-phuket-phi-phi-5-days", title: "Thailand: Phuket & Phi Phi Islands - 5 Days", tourType: OUTBOUND,
    destination: "Phuket", country: "Thailand",
    summary: "Turquoise bays, limestone cliffs and lively night markets. Speedboat to Phi Phi and Maya Bay, a James Bond Island cruise in Phang Nga Bay and free time on Patong Beach.",
    days: [
      ["Colombo to Phuket", "Fly to Phuket, transfer to your beach hotel in Patong. Evening at leisure on Bangla Road."],
      ["Phi Phi Islands", "Full-day speedboat trip to Phi Phi Don, Maya Bay and Pileh Lagoon with snorkelling and a Thai lunch."],
      ["Phang Nga Bay", "Long-tail boat cruise among the limestone towers of Phang Nga Bay and James Bond Island, with sea-canoeing."],
      ["Phuket city tour", "Big Buddha, Wat Chalong, Old Phuket Town and Karon viewpoint. Evening Phuket FantaSea show (optional)."],
      ["Phuket to Colombo", "Morning at leisure, then transfer to the airport for your flight home."],
    ],
    inclusions: ["Return air tickets", "4 nights in a 4-star beach hotel with breakfast", "Phi Phi and Phang Nga boat tours with lunch", "Airport transfers and city tour", "Sri Lankan tour coordinator"],
    departures: ["2026-11-20", "2026-12-18", "2027-01-22", "2027-02-19"],
    price: 289000,
    images: [PHOTOS.phiPhi, PHOTOS.phangNga, PHOTOS.thailand, PHOTOS.bangkok],
  }),
  tour({
    slug: "singapore-city-break-4-days", title: "Singapore City Break - 4 Days", tourType: OUTBOUND,
    destination: "Singapore", country: "Singapore",
    summary: "The best of the Lion City: Marina Bay Sands, Gardens by the Bay, Sentosa Island and Universal Studios, with plenty of time for shopping on Orchard Road.",
    days: [
      ["Colombo to Singapore", "Fly to Singapore and check in. Evening Marina Bay light show and the Supertree Grove."],
      ["City tour and Gardens by the Bay", "Merlion Park, Chinatown and Little India, then the Flower Dome and Cloud Forest."],
      ["Sentosa or Universal Studios", "A full day on Sentosa Island - Universal Studios, S.E.A. Aquarium or the beaches. Wings of Time show in the evening."],
      ["Singapore to Colombo", "Shopping on Orchard Road, then transfer to Changi Airport for your flight home."],
    ],
    inclusions: ["Return air tickets", "3 nights in a 4-star city hotel with breakfast", "Gardens by the Bay and Universal Studios tickets", "Airport transfers and city tour"],
    departures: ["2026-11-27", "2026-12-24", "2027-01-29", "2027-03-26"],
    price: 245000,
    images: [PHOTOS.marinaBay, PHOTOS.singapore],
  }),
  tour({
    slug: "maldives-overwater-villa-4-days", title: "Maldives Overwater Villa Escape - 4 Days", tourType: OUTBOUND,
    destination: "Malé Atoll", country: "Maldives",
    summary: "Wake up above a turquoise lagoon. Three nights in an overwater villa with all meals, speedboat transfers, snorkelling with turtles and a sunset dolphin cruise.",
    days: [
      ["Colombo to Malé", "One-hour flight to Malé and a speedboat transfer to your island resort. Check in to your overwater villa."],
      ["Lagoon and reef", "Guided snorkelling on the house reef with turtles and reef sharks. Spa time or kayaking in the afternoon."],
      ["Sandbank and sunset cruise", "Morning picnic on a private sandbank, then a sunset dolphin cruise."],
      ["Malé to Colombo", "Breakfast over the water, then speedboat and flight home."],
    ],
    inclusions: ["Return air tickets", "3 nights in an overwater villa, full board", "Return speedboat transfers", "Snorkelling trip and sunset dolphin cruise"],
    exclusions: ["Green tax (USD 6 per night)", "Travel insurance (we can arrange it)", "Spa treatments and drinks"],
    departures: ["2026-11-06", "2026-12-04", "2027-01-08", "2027-02-05"],
    price: 465000,
    images: [PHOTOS.maldivesAtoll, PHOTOS.maldivesVilla, PHOTOS.maldives],
  }),
  tour({
    slug: "dubai-highlights-5-days", title: "Dubai Highlights - 5 Days", tourType: OUTBOUND,
    destination: "Dubai", country: "United Arab Emirates",
    summary: "Burj Khalifa at sunset, a desert safari with barbecue dinner, a dhow cruise on Dubai Marina and a day in Abu Dhabi at the Sheikh Zayed Grand Mosque.",
    days: [
      ["Colombo to Dubai", "Fly to Dubai and check in. Evening dhow dinner cruise on Dubai Marina."],
      ["Modern Dubai", "Burj Khalifa (124th floor), Dubai Mall and the Dubai Fountain show. Photo stop at the Burj Al Arab."],
      ["Desert safari", "Morning at leisure. Afternoon dune bashing, camel ride, henna and a barbecue dinner with a show in a desert camp."],
      ["Abu Dhabi", "Day trip to the Sheikh Zayed Grand Mosque and the Louvre Abu Dhabi."],
      ["Dubai to Colombo", "Gold and spice souks in old Dubai, then transfer to the airport."],
    ],
    inclusions: ["Return air tickets", "4 nights in a 4-star hotel with breakfast", "Burj Khalifa tickets", "Desert safari with dinner", "Dhow cruise dinner", "Abu Dhabi day tour"],
    departures: ["2026-11-13", "2026-12-11", "2027-01-15", "2027-02-12"],
    price: 312000,
    images: [PHOTOS.dubaiSkyline, PHOTOS.burjAlArab],
  }),
  tour({
    slug: "japan-golden-route-8-days", title: "Japan Golden Route - 8 Days", tourType: OUTBOUND,
    destination: "Tokyo, Mount Fuji & Kyoto", country: "Japan",
    summary: "Tokyo's neon streets, Mount Fuji and Lake Kawaguchi, a bullet-train ride and the temples and geisha district of Kyoto. Best in cherry-blossom and autumn-leaf season.",
    days: [
      ["Colombo to Tokyo", "Overnight flight to Tokyo (Narita)."],
      ["Tokyo", "Arrive and check in. Evening in Shinjuku and Shibuya Crossing."],
      ["Tokyo sightseeing", "Senso-ji Temple in Asakusa, the Imperial Palace gardens, Ginza and Tokyo Skytree."],
      ["Mount Fuji", "Day trip to Lake Kawaguchi and the Chureito Pagoda for classic views of Mount Fuji."],
      ["Bullet train to Kyoto", "Shinkansen to Kyoto. Afternoon at Fushimi Inari's thousand torii gates."],
      ["Kyoto", "Kinkaku-ji (Golden Pavilion), Arashiyama bamboo grove and the Gion geisha district."],
      ["Nara day trip", "Todai-ji's giant Buddha and the friendly deer of Nara Park. Return to Osaka."],
      ["Osaka to Colombo", "Transfer to Kansai Airport for your flight home."],
    ],
    inclusions: ["Return air tickets", "6 nights in 3- and 4-star hotels with breakfast", "Bullet train ticket Tokyo - Kyoto", "Guided tours with entrance fees", "Japan visa assistance"],
    departures: ["2027-03-25", "2027-04-01", "2027-11-11", "2027-11-18"],
    price: 785000,
    images: [PHOTOS.fuji, PHOTOS.kyoto],
  }),
  tour({
    slug: "bali-temples-rice-terraces-6-days", title: "Bali: Temples & Rice Terraces - 6 Days", tourType: OUTBOUND,
    destination: "Ubud & Seminyak", country: "Indonesia",
    summary: "Lake temples, emerald rice terraces, waterfalls and beach sunsets. Three nights in Ubud's jungle and two by the sea in Seminyak.",
    days: [
      ["Colombo to Bali", "Fly to Denpasar and transfer to Ubud."],
      ["Ubud", "Tegallalang rice terraces, the Sacred Monkey Forest and Ubud art market."],
      ["Lake temples", "Ulun Danu Beratan temple on Lake Bratan and the Handara gate. Afternoon at a coffee plantation."],
      ["Waterfalls to Seminyak", "Tegenungan waterfall, then on to Seminyak. Sunset at Tanah Lot sea temple."],
      ["Beach day", "Free day on the beach or an optional Nusa Penida island trip."],
      ["Bali to Colombo", "Transfer to the airport for your flight home."],
    ],
    inclusions: ["Return air tickets", "5 nights in boutique hotels with breakfast", "Private car with English-speaking driver", "Entrance fees on the tours"],
    departures: ["2026-11-19", "2026-12-17", "2027-02-18", "2027-03-18"],
    price: 358000,
    images: [PHOTOS.baliTemple, PHOTOS.baliRice],
  }),
  tour({
    slug: "sri-lanka-hill-country-ella-3-days", title: "Sri Lanka Hill Country & Ella - 3 Days", tourType: INBOUND,
    destination: "Kandy, Nuwara Eliya & Ella", country: "Sri Lanka",
    summary: "Ride the famous blue train through tea country, walk across the Nine Arch Bridge and climb Little Adam's Peak for sunrise over the hills.",
    days: [
      ["Kandy to Nuwara Eliya", "Temple of the Tooth in Kandy, then up through tea estates with a factory visit and tea tasting."],
      ["Train to Ella", "The scenic train from Nanu Oya to Ella. Afternoon at the Nine Arch Bridge."],
      ["Little Adam's Peak", "Sunrise hike to Little Adam's Peak, Ravana Falls, then the drive back to Colombo."],
    ],
    inclusions: ["2 nights in boutique hotels with breakfast and dinner", "Air-conditioned car with driver-guide", "Train tickets (reserved seats)", "Tea factory visit"],
    exclusions: ["Entrance fees", "Lunches", "Tips and personal expenses"],
    departures: ["2026-11-07", "2026-11-21", "2026-12-05", "2026-12-19"],
    price: 68500,
    images: [PHOTOS.nineArch, PHOTOS.ella],
  }),
  tour({
    slug: "sri-lanka-cultural-triangle-yala-6-days", title: "Cultural Triangle & Yala Safari - 6 Days", tourType: INBOUND,
    destination: "Sigiriya, Dambulla, Kandy & Yala", country: "Sri Lanka",
    summary: "Climb Sigiriya Lion Rock, see the cave temples of Dambulla and the ancient city of Polonnaruwa, then go looking for leopards in Yala National Park.",
    days: [
      ["Colombo to Sigiriya", "Drive to Sigiriya with a stop at the Pinnawala elephant orphanage."],
      ["Sigiriya and Polonnaruwa", "Early climb of Sigiriya Rock Fortress, then the ruins of Polonnaruwa by bicycle."],
      ["Dambulla to Kandy", "Dambulla cave temple and a spice garden on the way to Kandy. Evening cultural dance show."],
      ["Kandy to Yala", "Temple of the Tooth, then drive south through the hills to Yala."],
      ["Yala safari", "Morning jeep safari to see leopards, elephants and sloth bears. Afternoon at the beach in Tissamaharama."],
      ["Yala to Colombo", "Drive back along the south coast via Galle Fort."],
    ],
    inclusions: ["5 nights in 4-star hotels, half board", "Air-conditioned car with driver-guide", "Yala jeep safari with park fees", "Cultural dance show"],
    exclusions: ["Sigiriya and site entrance fees", "Lunches", "Tips and personal expenses"],
    departures: ["2026-11-14", "2026-12-12", "2027-01-09", "2027-02-06"],
    price: 148000,
    images: [PHOTOS.sigiriya, PHOTOS.leopard, PHOTOS.sigiriyaSite],
  }),
];

// Creates a missing tour; an existing one keeps its admin edits and only
// gets the photos when it has none yet
async function addTour(data: Prisma.TourPackageCreateInput) {
  const existing = await prisma.tourPackage.findUnique({ where: { slug: data.slug } });
  if (existing == null) {
    await prisma.tourPackage.create({ data: data });
    console.log(`✓ added   ${data.title}`);
  } else if (existing.images.length == 0) {
    await prisma.tourPackage.update({ where: { id: existing.id }, data: { images: data.images } });
    console.log(`✓ photos  ${data.title}`);
  } else {
    console.log(`- kept    ${data.title}`);
  }
}

async function main() {
  for (const data of [DAMBADIVA, ...SAMPLE_TOURS]) {
    await addTour(data);
  }
  console.log(`\nTours are on the website's Travel page (/travel).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
