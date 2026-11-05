// Sample rental items for the website's Rentals page (Events division):
// huts and tents, chairs, tables, decoration, sound and lighting for
// weddings, funerals, parties and company events.
// Safe to run again: items are matched by SKU and only added when missing,
// so prices and stock changed in the admin portal are kept.
//   npm run seed:rentals
// Edit them later in the admin portal (Catalogue > Rental items).
// Prices and quantities are examples - change them before going live.
import "dotenv/config";
import prisma from "../lib/prisma";
import { PublishStatus } from "../app/generated/prisma/enums";

// Unsplash photo (free licence; Unsplash serves the image itself).
// Sample photos only - replace them with photos of your own equipment.
const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`;

type Item = {
  sku: string;
  name: string;
  category: string;
  description: string;
  highlights: string[];
  unit?: string;
  pricePerDay: number; // LKR, per unit per day
  quantityOwned: number;
  minQuantity?: number;
  deposit?: number;
  featured?: boolean;
  image?: string;
};

const ITEMS: Item[] = [
  // ── Tents & huts ──
  {
    sku: "RNT-HUT-WED-4060", name: "Wedding Hut (Marquee) 40 x 60 ft", category: "Tents & huts", featured: true,
    description: "Spacious decorated hut for wedding receptions and homecomings. Seats about 200 guests at round tables. Waterproof roof with draped ceiling and side curtains.",
    highlights: ["Seats about 200 guests", "Draped ceiling and side curtains", "Rain-proof roof", "Set up and taken down by our team"],
    unit: "hut", pricePerDay: 85000, quantityOwned: 3, deposit: 25000, image: unsplash("photo-1464366400600-7168b8af9bc3"),
  },
  {
    sku: "RNT-PAV-GAR-01", name: "Garden Pavilion (Gazebo)", category: "Tents & huts", featured: true,
    description: "Elegant white pavilion for poruwa ceremonies, garden weddings and photo spots. Decorated with flowers on request.",
    highlights: ["Ideal for the poruwa ceremony", "White frame with curtains", "Flower decoration on request"],
    unit: "pavilion", pricePerDay: 35000, quantityOwned: 4, image: unsplash("photo-1523438885200-e635ba2c371e"),
  },
  {
    sku: "RNT-CAN-FUN-2040", name: "Funeral Canopy Tent 20 x 40 ft (white)", category: "Tents & huts",
    description: "Plain white canopy for funerals, almsgivings (dana) and religious ceremonies at home. Shelters about 80 seated guests from sun and rain.",
    highlights: ["Shelters about 80 seated guests", "Quick setup at home or temple", "Available at short notice"],
    unit: "tent", pricePerDay: 18000, quantityOwned: 6,
  },
  // ── Chairs ──
  {
    sku: "RNT-CHR-GOLD", name: "Gold Chiavari Chair with Cushion", category: "Chairs", featured: true,
    description: "Classic gold chiavari chairs with a white seat cushion - the favourite for weddings and formal dinners.",
    highlights: ["Gold finish, white cushion", "Delivered and arranged at the venue"],
    pricePerDay: 650, quantityOwned: 400, minQuantity: 20, image: unsplash("photo-1519167758481-83f550bb49b3"),
  },
  {
    sku: "RNT-CHR-WHITE", name: "White Chair with Cover and Sash", category: "Chairs",
    description: "Chairs dressed in white covers with a satin sash in your colour. Perfect for church weddings and garden ceremonies.",
    highlights: ["Choose the sash colour", "Washed and pressed covers"],
    pricePerDay: 450, quantityOwned: 300, minQuantity: 20, image: unsplash("photo-1469371670807-013ccf25f16a"),
  },
  {
    sku: "RNT-CHR-BLACK", name: "Black Plastic Chair", category: "Chairs",
    description: "Sturdy, comfortable plastic chairs for funerals, almsgivings, meetings and large gatherings.",
    highlights: ["Stackable and easy to arrange", "Suitable for funerals and dana", "Large quantities available"],
    pricePerDay: 120, quantityOwned: 600, minQuantity: 25, image: unsplash("photo-1592078615290-033ee584e267"),
  },
  {
    sku: "RNT-CHR-WOOD", name: "Rustic Wooden Chair", category: "Chairs",
    description: "Warm wooden chairs for garden parties, rustic weddings and outdoor dinners.",
    highlights: ["Solid wood", "Great for outdoor settings"],
    pricePerDay: 550, quantityOwned: 150, minQuantity: 10, image: unsplash("photo-1506439773649-6e0eb8cfb237"),
  },
  // ── Tables ──
  {
    sku: "RNT-TBL-BANQ-6FT", name: "Banquet Table 6 ft with White Cloth", category: "Tables",
    description: "Long rectangular table with a pressed white tablecloth. Seats 6 to 8 guests or serves as a buffet table.",
    highlights: ["Seats 6 to 8", "White tablecloth included", "Use as buffet or gift table"],
    pricePerDay: 1500, quantityOwned: 60, minQuantity: 2, image: unsplash("photo-1519225421980-715cb0215aed"),
  },
  {
    sku: "RNT-TBL-ROUND-10", name: "Round Table for 10 with Cloth", category: "Tables",
    description: "5 ft round table with a floor-length cloth, the standard for wedding receptions.",
    highlights: ["Seats 10 guests", "Floor-length cloth included"],
    pricePerDay: 2200, quantityOwned: 40, minQuantity: 2, image: unsplash("photo-1511795409834-ef04bbd61622"),
  },
  // ── Decoration & lighting ──
  {
    sku: "RNT-DEC-CENTRE", name: "Table Flower Centrepiece", category: "Decoration",
    description: "Fresh flower arrangement in a glass vase for each table, in colours that match your theme.",
    highlights: ["Fresh flowers", "Colours to match your theme"],
    pricePerDay: 3500, quantityOwned: 50, minQuantity: 5, image: unsplash("photo-1561181286-d3fee7d55364"),
  },
  {
    sku: "RNT-DEC-LIGHTS", name: "Fairy Light Canopy (per 10 m)", category: "Decoration",
    description: "Warm-white fairy lights strung across the ceiling of a hut or garden for a magical evening glow.",
    highlights: ["Warm-white LEDs", "Hung by our team"],
    unit: "10 m", pricePerDay: 2500, quantityOwned: 40, minQuantity: 2, image: unsplash("photo-1482517967863-00e15c9b44be"),
  },
  {
    sku: "RNT-DEC-BALLOON", name: "Balloon Decoration Package", category: "Decoration",
    description: "Balloon arch and bunches in your colours for birthdays, welcome parties and school events.",
    highlights: ["Arch plus 10 balloon bunches", "Your choice of colours"],
    unit: "package", pricePerDay: 12000, quantityOwned: 8, image: unsplash("photo-1530103862676-de8c9debad1d"),
  },
  // ── Sound & AV ──
  {
    sku: "RNT-SND-PA-2SPK", name: "Sound System (2 Speakers + Mixer)", category: "Sound & AV", featured: true,
    description: "Powered PA system for speeches, music and religious sermons. Covers up to 300 guests.",
    highlights: ["Two powered speakers on stands", "Mixer for microphones and music", "Covers up to 300 guests"],
    unit: "set", pricePerDay: 15000, quantityOwned: 6, deposit: 10000, image: unsplash("photo-1545454675-3531b543be5d"),
  },
  {
    sku: "RNT-SND-MIC", name: "Wireless Microphone Set (2 mics)", category: "Sound & AV",
    description: "Two wireless handheld microphones with receiver - for speeches, toasts and announcements.",
    highlights: ["Two handheld microphones", "Works with our sound system"],
    unit: "set", pricePerDay: 4500, quantityOwned: 10, image: unsplash("photo-1478737270239-2f02b77fc618"),
  },
  {
    sku: "RNT-AV-PROJECTOR", name: "Projector with 8 ft Screen", category: "Sound & AV",
    description: "Bright HD projector and an 8 ft screen for slideshows, memorial photo tributes and presentations.",
    highlights: ["HD projector", "8 ft screen on a stand", "HDMI cable included"],
    unit: "set", pricePerDay: 9500, quantityOwned: 4, deposit: 15000, image: unsplash("photo-1478720568477-152d9b164e26"),
  },
  {
    sku: "RNT-SND-DJ", name: "DJ with Lights (per evening)", category: "Sound & AV",
    description: "Experienced DJ with a full sound and dance-floor lighting setup for wedding receptions and parties.",
    highlights: ["Up to 5 hours of music", "Dance-floor lighting", "Your playlist requests"],
    unit: "evening", pricePerDay: 45000, quantityOwned: 2, image: unsplash("photo-1470225620780-dba8ba36b745"),
  },
];

async function main() {
  for (const item of ITEMS) {
    const existing = await prisma.rentalItem.findUnique({ where: { sku: item.sku } });
    if (existing) {
      console.log(`- kept    ${item.sku.padEnd(20)} ${item.name}`);
      continue;
    }
    const { image, ...rest } = item;
    await prisma.rentalItem.create({
      data: { ...rest, images: image ? [image] : [], status: PublishStatus.PUBLISHED },
    });
    console.log(`✓ added   ${item.sku.padEnd(20)} ${item.name}`);
  }
  console.log(`\nRental items are on the website's Rentals page (/rentals).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
