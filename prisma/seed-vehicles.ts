// Sample vehicles and spare parts for the Vehicles & Machinery division, so
// the website's vehicle list, spare-parts list and "browse by make & model"
// have something to show. Safe to run again: listings are matched by SKU and
// updated, never duplicated.
//   npm run seed:vehicles
// Edit or archive them later in the admin portal (Catalogue > Vehicles &
// machinery / Spare parts). Prices are examples - change them before going live.
import "dotenv/config";
import prisma from "../lib/prisma";
import {
  Availability,
  PricingMode,
  PublishStatus,
  VehicleListingType,
} from "../app/generated/prisma/enums";

type Listing = {
  sku: string;
  listingType: VehicleListingType;
  title: string;
  description: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  mileageKm?: number;
  operatingHours?: number;
  fuelType?: string;
  transmission?: string;
  partNumber?: string;
  compatibleWith?: string[];
  stock?: number;
  price?: number; // LKR; leave out for "price on request"
  availability?: Availability;
};

const { NEW_VEHICLE, USED_VEHICLE, SPARE_PART, HEAVY_MACHINERY } = VehicleListingType;

const LISTINGS: Listing[] = [
  // ─────────────── Vehicles ───────────────
  {
    sku: "VEH-TOY-AQUA-01", listingType: USED_VEHICLE, title: "2018 Toyota Aqua S - hybrid",
    description: "Fuel-efficient hybrid hatchback. Japanese import, one owner in Sri Lanka, full service history.",
    make: "Toyota", model: "Aqua", year: 2018, condition: "Used - excellent", mileageKm: 62000, fuelType: "Hybrid", transmission: "Automatic", price: 7250000,
  },
  {
    sku: "VEH-TOY-AXIO-01", listingType: USED_VEHICLE, title: "2017 Toyota Axio G - hybrid",
    description: "Comfortable family sedan with low running costs. Push start, reverse camera, alloy wheels.",
    make: "Toyota", model: "Axio", year: 2017, condition: "Used - very good", mileageKm: 78000, fuelType: "Hybrid", transmission: "Automatic", price: 9850000,
  },
  {
    sku: "VEH-TOY-PRIUS-01", listingType: NEW_VEHICLE, title: "2024 Toyota Prius Z - brand new",
    description: "Latest-generation Prius, imported to order. Choose your colour; delivery in about 8 weeks.",
    make: "Toyota", model: "Prius", year: 2024, condition: "Brand new", mileageKm: 0, fuelType: "Hybrid", transmission: "Automatic",
  },
  {
    sku: "VEH-HON-VEZEL-01", listingType: USED_VEHICLE, title: "2019 Honda Vezel RS - hybrid",
    description: "Sporty compact SUV with Honda Sensing safety pack, sunroof and leather seats.",
    make: "Honda", model: "Vezel", year: 2019, condition: "Used - excellent", mileageKm: 41000, fuelType: "Hybrid", transmission: "Automatic", price: 11900000,
  },
  {
    sku: "VEH-HON-FIT-01", listingType: USED_VEHICLE, title: "2016 Honda Fit GP5 - hybrid",
    description: "Practical city car with magic seats and a large boot. Well maintained.",
    make: "Honda", model: "Fit", year: 2016, condition: "Used - good", mileageKm: 89000, fuelType: "Hybrid", transmission: "Automatic", price: 6300000,
  },
  {
    sku: "VEH-SUZ-WAGONR-01", listingType: NEW_VEHICLE, title: "2024 Suzuki Wagon R FZ - brand new",
    description: "Economical kei car, ideal for city driving. Brand new with dealer warranty.",
    make: "Suzuki", model: "Wagon R", year: 2024, condition: "Brand new", mileageKm: 0, fuelType: "Petrol", transmission: "Automatic", price: 6950000,
  },
  {
    sku: "VEH-NIS-XTRAIL-01", listingType: USED_VEHICLE, title: "2017 Nissan X-Trail - hybrid 4WD",
    description: "Seven-seat SUV with four-wheel drive, ideal for family trips upcountry.",
    make: "Nissan", model: "X-Trail", year: 2017, condition: "Used - very good", mileageKm: 70500, fuelType: "Hybrid", transmission: "Automatic", price: 12500000, availability: Availability.RESERVED,
  },
  {
    sku: "VEH-MIT-MONTERO-01", listingType: USED_VEHICLE, title: "2015 Mitsubishi Montero Sport",
    description: "Rugged diesel SUV, serviced on schedule. Price on request - ask us for an inspection report.",
    make: "Mitsubishi", model: "Montero", year: 2015, condition: "Used - good", mileageKm: 112000, fuelType: "Diesel", transmission: "Automatic",
  },
  {
    sku: "MCH-CAT-320D-01", listingType: HEAVY_MACHINERY, title: "Caterpillar 320D excavator",
    description: "20-tonne hydraulic excavator, reconditioned in Japan. Ready for construction and quarry work.",
    make: "Caterpillar", model: "320D", year: 2012, condition: "Reconditioned", operatingHours: 9800, fuelType: "Diesel",
  },
  {
    sku: "MCH-JCB-3CX-01", listingType: HEAVY_MACHINERY, title: "JCB 3CX backhoe loader",
    description: "Versatile backhoe loader for road works and site preparation. Serviced and inspected.",
    make: "JCB", model: "3CX", year: 2016, condition: "Used - good", operatingHours: 6400, fuelType: "Diesel", price: 18500000,
  },

  // ─────────────── Spare parts ───────────────
  {
    sku: "PRT-BRK-TOY-01", listingType: SPARE_PART, title: "Front brake pads (set of 4)",
    description: "Genuine Toyota front disc brake pads.",
    partNumber: "04465-52260", condition: "Genuine new", compatibleWith: ["Toyota Aqua", "Toyota Axio", "Toyota Vitz"], stock: 12, price: 14500,
  },
  {
    sku: "PRT-OIL-TOY-01", listingType: SPARE_PART, title: "Engine oil filter",
    description: "Genuine Toyota oil filter for 1NZ / 2NZ / 2ZR engines.",
    partNumber: "90915-10003", condition: "Genuine new", compatibleWith: ["Toyota Aqua", "Toyota Axio", "Toyota Prius", "Toyota Corolla"], stock: 40, price: 2800,
  },
  {
    sku: "PRT-HVB-TOY-01", listingType: SPARE_PART, title: "Hybrid battery pack (reconditioned)",
    description: "Reconditioned hybrid battery with new cells and a 1-year warranty. Fitting available.",
    partNumber: "G9280-52030", condition: "Reconditioned", compatibleWith: ["Toyota Aqua", "Toyota Prius"], stock: 3, price: 285000,
  },
  {
    sku: "PRT-AIR-HON-01", listingType: SPARE_PART, title: "Engine air filter",
    description: "OEM-quality air filter for Honda i-DCD hybrids.",
    partNumber: "17220-5R0-008", condition: "OEM new", compatibleWith: ["Honda Vezel", "Honda Fit", "Honda Grace"], stock: 25, price: 4200,
  },
  {
    sku: "PRT-HL-HON-01", listingType: SPARE_PART, title: "Headlight assembly - right side (LED)",
    description: "Complete LED headlight unit, Japanese used, tested and working.",
    partNumber: "33100-T7A-J01", condition: "Used - tested", compatibleWith: ["Honda Vezel"], stock: 1, price: 98000,
  },
  {
    sku: "PRT-SHK-SUZ-01", listingType: SPARE_PART, title: "Front shock absorber",
    description: "Front strut for Suzuki kei cars.",
    partNumber: "41601-63R10", condition: "Genuine new", compatibleWith: ["Suzuki Wagon R", "Suzuki Spacia", "Suzuki Hustler"], stock: 6, price: 18900,
  },
  {
    sku: "PRT-WIP-NIS-01", listingType: SPARE_PART, title: "Wiper blade set",
    description: "Front wiper blades, pair.",
    partNumber: "28890-4CA0A", condition: "Genuine new", compatibleWith: ["Nissan X-Trail", "Nissan Leaf"], stock: 15, price: 6500,
  },
  {
    sku: "PRT-TIM-MIT-01", listingType: SPARE_PART, title: "Timing belt kit",
    description: "Timing belt, tensioner and idler for 4D56 / 4M41 diesel engines. Price depends on engine - ask us.",
    partNumber: "MD320050", condition: "Genuine new", compatibleWith: ["Mitsubishi Montero", "Mitsubishi L200", "Mitsubishi Pajero"], stock: 0,
  },
  {
    sku: "PRT-BKT-CAT-01", listingType: SPARE_PART, title: "Bucket teeth (set of 5)",
    description: "Heavy-duty bucket teeth for 20-tonne excavators.",
    partNumber: "1U3352", condition: "Aftermarket new", compatibleWith: ["Caterpillar 320D", "Komatsu PC200"], stock: 8, price: 42000,
  },
  {
    sku: "PRT-HYD-JCB-01", listingType: SPARE_PART, title: "Hydraulic pump",
    description: "Main hydraulic pump, reconditioned and pressure-tested.",
    partNumber: "20/925581", condition: "Reconditioned", compatibleWith: ["JCB 3CX", "JCB 4CX"], stock: 2,
  },
];

async function main() {
  for (const listing of LISTINGS) {
    const { price, ...rest } = listing;
    const data = {
      ...rest,
      compatibleWith: listing.compatibleWith ?? [],
      stock: listing.stock ?? 1,
      availability: listing.availability ?? Availability.AVAILABLE,
      pricingMode: price != undefined ? PricingMode.FIXED : PricingMode.ON_REQUEST,
      price: price ?? null,
      currency: price != undefined ? "LKR" : null,
      status: PublishStatus.PUBLISHED,
    };
    await prisma.vehicleListing.upsert({
      where: { sku: listing.sku },
      create: data,
      update: data,
    });
    console.log(`✓ ${listing.sku}  ${listing.title}`);
  }
  console.log(`\n${LISTINGS.length} vehicle listings and spare parts are published.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
