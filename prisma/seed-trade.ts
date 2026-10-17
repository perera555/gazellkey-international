// Sample Import and Export products, so the website's Import, Export and Shop
// pages have something to show. Two or more per category: retail packs with a
// fixed price (buyable online) plus a few bulk lines on "price on request".
// Safe to run again: products are matched by SKU and updated, never duplicated.
//   npm run seed:trade
// Edit or archive them later in the admin portal (Catalogue > Import products /
// Export products). Prices and stock are examples - change them before going live.
import "dotenv/config";
import prisma from "../lib/prisma";
import {
  PricingMode,
  PublishStatus,
  TradeCategory,
  TradeDirection,
} from "../app/generated/prisma/enums";

type Product = {
  sku: string;
  category: TradeCategory;
  name: string;
  description: string;
  origin?: string;
  packaging?: string;
  unit?: string; // default "pack"
  minimumOrderQty?: number;
  stockQty?: number;
  requiresPermit?: boolean;
  specifications?: Record<string, string>;
  price?: number; // leave out for "price on request"
  currency?: string; // default: USD for exports, LKR for imports
  images?: string[];
};

// Unsplash photo (free licence; Unsplash serves the image itself)
const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`;

// Export photos are in the website's /public/images; import product photos
// come from Unsplash. Sample photos only - replace with your own product shots.
const IMG = {
  tea: "/images/export-tea.jpg",
  spices: "/images/export-spices.jpg",
  coffee: "/images/export-coffee.jpg",
  chocolate: "/images/export-chocolate.jpg",
  fruits: "/images/export-fruits.jpg",
  electronics: "/images/import-electronics.jpg",
  // sports
  cricket: unsplash("photo-1624526267942-ab0ff8a3e972"),
  yogaMats: unsplash("photo-1601925260368-ae2f83cf8b7f"),
  football: unsplash("photo-1579952363873-27f3bade9f55"),
  dumbbells: unsplash("photo-1583454110551-21f2fa2afe61"),
  cycling: unsplash("photo-1517649763962-0c623066013b"),
  // shoes
  runningShoes: unsplash("photo-1542291026-7eec264c27ff"),
  heels: unsplash("photo-1543163521-1bf539c55dd2"),
  sneakers: unsplash("photo-1560769629-975ec94e6a86"),
  leatherSneakers: unsplash("photo-1549298916-b41d501d3772"),
  boots: unsplash("photo-1608256246200-53e635b5b65f"),
  sandals: unsplash("photo-1603487742131-4160ec999306"),
  // clothes
  shirt: unsplash("photo-1596755094514-f87e34085b2c"),
  clothes: unsplash("photo-1434389677669-e08b4cac3105"),
  tshirt: unsplash("photo-1521572163474-6864f9cf17ab"),
  jacket: unsplash("photo-1591047139829-d91aecb6caea"),
  jeans: unsplash("photo-1542272604-787c3835535d"),
  dress: unsplash("photo-1595777457583-95e059d581b8"),
  // fancy items
  fairyLights: unsplash("photo-1482517967863-00e15c9b44be"),
  frames: unsplash("photo-1513519245088-0e12902e5a38"),
  clock: unsplash("photo-1563861826100-9cb868fdbe1c"),
  sunglasses: unsplash("photo-1572635196237-14b3f281503f"),
  // electrical
  rice: unsplash("photo-1516684732162-798a0062be99"),
  kettle: unsplash("photo-1594213114663-d94db9b17125"),
  iron: unsplash("photo-1489274495757-95c7c837b101"),
  tv: unsplash("photo-1593359677879-a4bb92f829d1"),
  // computers & phones
  laptop: unsplash("photo-1517336714731-489689fd1ca8"),
  phone: unsplash("photo-1511707171634-5f897ff02aa9"),
  smartwatch: unsplash("photo-1546868871-7041f2a55e12"),
  headphones: unsplash("photo-1505740420928-5e560c06d30e"),
  earbuds: unsplash("photo-1590658268037-6bf12165a8df"),
  // food
  oliveOil: unsplash("photo-1474979266404-7eaacbcd87c5"),
  pasta: unsplash("photo-1551462147-ff29053bfc14"),
  // tools
  drill: unsplash("photo-1504148455328-c376907d081c"),
  handTools: unsplash("photo-1530124566582-a618bc2615dc"),
  socketSet: unsplash("photo-1581244277943-fe4a9c777189"),
};

const T = TradeCategory;

// ─────────────── Export: Ceylon produce ───────────────
const EXPORTS: Product[] = [
  {
    sku: "EXP-TEA-BOPF-500", category: T.TEA, name: "Ceylon BOPF Black Tea - 500 g",
    description: "Strong, bright Uva-region BOPF with a brisk, coppery cup. Ideal with milk. Packed fresh at origin in a foil-lined pouch.",
    origin: "Uva, Sri Lanka", packaging: "500 g foil pouch", stockQty: 120, price: 9.5, images: [IMG.tea],
    specifications: { Grade: "BOPF", Elevation: "High grown", "Best before": "24 months" },
  },
  {
    sku: "EXP-TEA-GREEN-100", category: T.TEA, name: "Ceylon Green Tea Tin - 100 g",
    description: "Delicate whole-leaf green tea from Nuwara Eliya estates. Light, grassy and naturally low in bitterness.",
    origin: "Nuwara Eliya, Sri Lanka", packaging: "100 g gift tin", stockQty: 80, price: 7.25, images: [IMG.tea],
    specifications: { Grade: "Gunpowder", Brew: "80 °C for 2-3 minutes" },
  },
  {
    sku: "EXP-TEA-BULK-BOP", category: T.TEA, name: "Bulk BOP Black Tea (wholesale)",
    description: "Auction-grade BOP for packers and distributors, shipped in 50 kg paper sacks. Samples and grade certificates on request.",
    origin: "Sri Lanka", packaging: "50 kg multi-wall paper sack", unit: "kg", minimumOrderQty: 500, images: [IMG.tea],
    specifications: { Grade: "BOP", Certification: "ISO 3720, Lion logo available" },
  },
  {
    sku: "EXP-SPC-CINN-ALBA", category: T.SPICES, name: "True Ceylon Cinnamon Alba Quills - 100 g",
    description: "The finest grade of true cinnamon (Cinnamomum verum): pencil-thin, hand-rolled quills with a sweet, delicate flavour.",
    origin: "Matale, Sri Lanka", packaging: "100 g resealable pouch", stockQty: 150, price: 6.9, images: [IMG.spices],
    specifications: { Grade: "Alba", Coumarin: "Very low" },
  },
  {
    sku: "EXP-SPC-PEPPER-250", category: T.SPICES, name: "Ceylon Black Pepper - 250 g",
    description: "Bold, pungent black peppercorns with high piperine content, sun-dried and machine cleaned.",
    origin: "Kandy, Sri Lanka", packaging: "250 g pouch", stockQty: 200, price: 4.8, images: [IMG.spices],
    specifications: { Density: "550 g/l", Moisture: "Under 12%" },
  },
  {
    sku: "EXP-SPC-MIX-GIFT", category: T.SPICES, name: "Ceylon Spice Gift Box (6 spices)",
    description: "Cinnamon, cloves, cardamom, nutmeg, pepper and curry powder in a hand-made wooden box. A favourite gift from Sri Lanka.",
    origin: "Sri Lanka", packaging: "Wooden box, 6 × 50 g", stockQty: 60, price: 19.9, images: [IMG.spices],
  },
  {
    sku: "EXP-SPC-BULK-CLOVE", category: T.SPICES, name: "Bulk Cloves (wholesale)",
    description: "Hand-picked, sun-dried cloves for food manufacturers and spice traders. Shipped in 25 kg PP bags.",
    origin: "Sri Lanka", packaging: "25 kg PP bag", unit: "kg", minimumOrderQty: 250, images: [IMG.spices],
  },
  {
    sku: "EXP-COF-ARABICA-250", category: T.COFFEE, name: "Highland Arabica Coffee Beans - 250 g",
    description: "Medium-roast single-origin arabica from the central hills. Notes of cocoa, citrus and caramel.",
    origin: "Haputale, Sri Lanka", packaging: "250 g valve bag", stockQty: 70, price: 11.5, images: [IMG.coffee],
    specifications: { Roast: "Medium", Process: "Washed", Altitude: "1,400 m" },
  },
  {
    sku: "EXP-COF-GROUND-200", category: T.COFFEE, name: "Ceylon Ground Coffee - 200 g",
    description: "Smooth everyday blend, ground for filter and French press.",
    origin: "Sri Lanka", packaging: "200 g pouch", stockQty: 90, price: 6.5, images: [IMG.coffee],
  },
  {
    sku: "EXP-CHO-DARK-70", category: T.CHOCOLATE, name: "70% Dark Chocolate with Ceylon Cinnamon",
    description: "Bean-to-bar dark chocolate made with Sri Lankan cocoa and a hint of true cinnamon.",
    origin: "Kandy, Sri Lanka", packaging: "80 g bar", stockQty: 140, price: 4.5, images: [IMG.chocolate],
    specifications: { Cocoa: "70%", Allergens: "May contain milk and nuts" },
  },
  {
    sku: "EXP-CHO-GIFT-12", category: T.CHOCOLATE, name: "Tropical Truffle Gift Box (12 pieces)",
    description: "Hand-made truffles with king coconut, passion fruit, cardamom and Ceylon tea fillings.",
    origin: "Colombo, Sri Lanka", packaging: "Gift box, 12 pieces", stockQty: 40, price: 16, images: [IMG.chocolate],
  },
  {
    sku: "EXP-FRT-MANGO-DRY", category: T.FRUITS_VEGETABLES, name: "Dried Karthakolomban Mango - 200 g",
    description: "Naturally sweet slices of Sri Lanka's famous Karthakolomban mango, dried without added sugar.",
    origin: "Jaffna, Sri Lanka", packaging: "200 g pouch", stockQty: 100, price: 5.75, images: [IMG.fruits],
  },
  {
    sku: "EXP-FRT-COCONUT-OIL", category: T.FRUITS_VEGETABLES, name: "Virgin Coconut Oil - 500 ml",
    description: "Cold-pressed virgin coconut oil from fresh Sri Lankan coconuts. For cooking, hair and skin.",
    origin: "Kurunegala, Sri Lanka", packaging: "500 ml glass jar", unit: "jar", stockQty: 110, price: 8.9, images: [IMG.fruits],
  },
  {
    sku: "EXP-FRT-BULK-PINE", category: T.FRUITS_VEGETABLES, name: "Fresh Pineapple - container loads",
    description: "MD2 and Mauritius pineapples, graded and air-freighted or shipped in reefer containers to your market.",
    origin: "Gampaha, Sri Lanka", packaging: "Cartons of 8-10 fruit", unit: "kg", minimumOrderQty: 1000, images: [IMG.fruits],
  },
];

// ─────────────── Import: goods delivered in Sri Lanka ───────────────
const IMPORTS: Product[] = [
  {
    sku: "IMP-SPO-CRICKET-BAT", category: T.SPORTS_ITEMS, name: "English Willow Cricket Bat - Grade 2",
    description: "Hand-crafted English willow bat with 8-10 straight grains, full-size, knocked in and ready to play.",
    origin: "United Kingdom", packaging: "Bat with padded cover", unit: "piece", stockQty: 15, price: 48500, images: [IMG.cricket],
    specifications: { Weight: "2 lb 9 oz - 2 lb 11 oz", Size: "Short handle" },
  },
  {
    sku: "IMP-SPO-YOGA-MAT", category: T.SPORTS_ITEMS, name: "Non-slip Yoga Mat 6 mm",
    description: "Eco-friendly TPE mat with alignment lines and a carry strap. Non-slip on both sides.",
    origin: "China", packaging: "Rolled with strap", unit: "piece", stockQty: 40, price: 6950, images: [IMG.yogaMats],
  },
  {
    sku: "IMP-SPO-FOOTBALL-5", category: T.SPORTS_ITEMS, name: "Match Football - Size 5",
    description: "Thermo-bonded 12-panel match ball with a butyl bladder for true flight and long-lasting air.",
    origin: "Pakistan", packaging: "Boxed, deflated", unit: "piece", stockQty: 50, price: 5900, images: [IMG.football],
  },
  {
    sku: "IMP-SPO-DUMBBELLS", category: T.SPORTS_ITEMS, name: "Adjustable Dumbbell Set 2 × 10 kg",
    description: "Cast-iron plates with spin-lock handles - adjust from 2.5 kg to 10 kg per hand. Ideal for home workouts.",
    origin: "China", packaging: "Carry case", unit: "set", stockQty: 20, price: 18900, images: [IMG.dumbbells],
  },
  {
    sku: "IMP-SPO-ROAD-BIKE", category: T.SPORTS_ITEMS, name: "Aluminium Road Bike - 21 Speed",
    description: "Light aluminium frame, 700c wheels, Shimano gears and dual caliper brakes. Frame sizes S, M and L.",
    origin: "Taiwan", packaging: "Bike box, 85% assembled", unit: "piece", stockQty: 6, price: 165000, images: [IMG.cycling],
    specifications: { Frame: "6061 aluminium", Gears: "3 × 7 speed", Wheels: "700c" },
  },
  {
    sku: "IMP-SHO-RUNNING-M", category: T.SHOES, name: "Men's Lightweight Running Shoes",
    description: "Breathable mesh running shoes with cushioned sole. Sizes 40-45 - tell us your size after ordering.",
    origin: "Vietnam", packaging: "Shoe box", unit: "pair", stockQty: 30, price: 14900, images: [IMG.runningShoes],
  },
  {
    sku: "IMP-SHO-LEATHER-W", category: T.SHOES, name: "Women's Printed Stiletto Heels",
    description: "Eye-catching pointed-toe stilettos with a 9 cm heel and cushioned insole. Sizes 36-41.",
    origin: "Italy", packaging: "Shoe box", unit: "pair", stockQty: 25, price: 16800, images: [IMG.heels],
  },
  {
    sku: "IMP-SHO-SNEAKER-U", category: T.SHOES, name: "Colour-block Casual Sneakers",
    description: "Lightweight everyday sneakers with a knit upper and soft foam sole. Unisex sizes 37-45.",
    origin: "Vietnam", packaging: "Shoe box", unit: "pair", stockQty: 40, price: 11900, images: [IMG.sneakers],
  },
  {
    sku: "IMP-SHO-LEATHER-SNK", category: T.SHOES, name: "Leather Low-top Sneakers",
    description: "Tan nubuck leather sneakers with a gum sole - smart enough for the office. Men's sizes 40-45.",
    origin: "Indonesia", packaging: "Shoe box", unit: "pair", stockQty: 20, price: 18500, images: [IMG.leatherSneakers],
  },
  {
    sku: "IMP-SHO-BOOTS-M", category: T.SHOES, name: "Men's Leather Lace-up Boots",
    description: "Dark-brown full-grain leather boots with a padded collar and rubber sole. Sizes 40-45.",
    origin: "India", packaging: "Shoe box", unit: "pair", stockQty: 15, price: 22900, images: [IMG.boots],
  },
  {
    sku: "IMP-SHO-SANDALS", category: T.SHOES, name: "Cork Footbed Two-strap Sandals",
    description: "Comfortable contoured cork footbed with suede straps and adjustable buckles. Unisex sizes 36-45.",
    origin: "Portugal", packaging: "Shoe box", unit: "pair", stockQty: 35, price: 9900, images: [IMG.sandals],
  },
  {
    sku: "IMP-CLO-LINEN-SHIRT", category: T.CLOTHES, name: "Men's Linen Shirt",
    description: "Cool, breathable pure linen shirt - perfect for Sri Lankan weather. Sizes S-XXL, five colours.",
    origin: "Bangladesh", packaging: "Folded, polybag", unit: "piece", stockQty: 60, price: 5450, images: [IMG.shirt],
  },
  {
    sku: "IMP-CLO-WHOLESALE", category: T.CLOTHES, name: "Garment stock lots (wholesale)",
    description: "Mixed branded overrun and stock-lot clothing for retailers, by the bale. Tell us the styles and sizes you need.",
    origin: "Bangladesh / India", packaging: "Bales of 50-100 kg", unit: "kg", minimumOrderQty: 200, images: [IMG.clothes],
  },
  {
    sku: "IMP-CLO-TSHIRT", category: T.CLOTHES, name: "Premium Cotton Crew-neck T-shirt",
    description: "Heavyweight 100% combed cotton tee that keeps its shape wash after wash. Sizes S-XXL.",
    origin: "Bangladesh", packaging: "Folded, polybag", unit: "piece", stockQty: 100, price: 2650, images: [IMG.tshirt],
  },
  {
    sku: "IMP-CLO-BOMBER", category: T.CLOTHES, name: "Lightweight Bomber Jacket",
    description: "Water-resistant bomber with ribbed cuffs and two zip pockets. Great for travel and air-conditioned offices.",
    origin: "China", packaging: "Folded, polybag", unit: "piece", stockQty: 30, price: 9750, images: [IMG.jacket],
  },
  {
    sku: "IMP-CLO-JEANS", category: T.CLOTHES, name: "Men's Slim-fit Stretch Jeans",
    description: "Classic five-pocket jeans in stretch denim for all-day comfort. Waist 28-38.",
    origin: "Pakistan", packaging: "Folded, polybag", unit: "piece", stockQty: 45, price: 7900, images: [IMG.jeans],
  },
  {
    sku: "IMP-CLO-MAXI-DRESS", category: T.CLOTHES, name: "Flowing Chiffon Maxi Dress",
    description: "Elegant full-length chiffon dress with a flattering wrap waist. Sizes XS-XL, in red, navy and emerald.",
    origin: "India", packaging: "Folded, polybag", unit: "piece", stockQty: 25, price: 12500, images: [IMG.dress],
  },
  {
    sku: "IMP-FAN-LED-LIGHTS", category: T.FANCY_ITEMS, name: "Warm-white LED Fairy Lights - 10 m",
    description: "100 warm-white LEDs on copper wire with 8 modes and a USB plug. For homes, weddings and Vesak.",
    origin: "China", packaging: "Gift box", unit: "set", stockQty: 120, price: 1850, images: [IMG.fairyLights],
  },
  {
    sku: "IMP-FAN-PHOTO-FRAME", category: T.FANCY_ITEMS, name: "Gallery Wall Frame Set (9 pieces)",
    description: "Mix-and-match black and white frames in five sizes to build a gallery wall. Glass fronts, hanging hooks included.",
    origin: "China", packaging: "Boxed set", unit: "set", stockQty: 35, price: 8900, images: [IMG.frames],
  },
  {
    sku: "IMP-FAN-WALL-CLOCK", category: T.FANCY_ITEMS, name: "Minimalist Silent Wall Clock 30 cm",
    description: "Clean white dial with a silent sweep movement - no ticking. Runs on one AA battery.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 40, price: 3450, images: [IMG.clock],
  },
  {
    sku: "IMP-FAN-SUNGLASSES", category: T.FANCY_ITEMS, name: "Classic Polarised Sunglasses",
    description: "Timeless square frames with polarised UV400 lenses that cut glare at the beach and on the road. Case included.",
    origin: "China", packaging: "Hard case", unit: "piece", stockQty: 60, price: 4900, images: [IMG.sunglasses],
  },
  {
    sku: "IMP-ELE-AIRFRYER", category: T.ELECTRICAL_ITEMS, name: "Digital Air Fryer 5.5 L",
    description: "Oil-free cooking with 8 presets, a touch panel and a non-stick basket. UK plug, 230 V, 1 year warranty.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 20, price: 28900, images: [IMG.electronics],
    specifications: { Power: "1700 W", Capacity: "5.5 L", Warranty: "1 year" },
  },
  {
    sku: "IMP-ELE-RICE-COOKER", category: T.ELECTRICAL_ITEMS, name: "Rice Cooker 1.8 L",
    description: "Automatic rice cooker with keep-warm, steaming tray and measuring cup. Cooks up to 10 cups.",
    origin: "Malaysia", packaging: "Retail box", unit: "piece", stockQty: 25, price: 11500, images: [IMG.rice],
  },
  {
    sku: "IMP-ELE-KETTLE", category: T.ELECTRICAL_ITEMS, name: "Stainless Steel Kettle 2.5 L",
    description: "Classic polished steel kettle for gas and induction hobs. Whistles when the water boils.",
    origin: "India", packaging: "Retail box", unit: "piece", stockQty: 30, price: 6200, images: [IMG.kettle],
  },
  {
    sku: "IMP-ELE-STEAM-IRON", category: T.ELECTRICAL_ITEMS, name: "Steam Iron 2400 W",
    description: "Ceramic soleplate, vertical steam and self-clean function. Anti-drip and auto shut-off for safety.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 35, price: 8450, images: [IMG.iron],
    specifications: { Power: "2400 W", Tank: "300 ml", Warranty: "1 year" },
  },
  {
    sku: "IMP-ELE-SMART-TV-43", category: T.ELECTRICAL_ITEMS, name: "43\" 4K Smart TV",
    description: "4K UHD smart TV with built-in streaming apps, Wi-Fi and three HDMI ports. Wall bracket included.",
    origin: "Malaysia", packaging: "Retail box", unit: "piece", stockQty: 10, price: 139000, images: [IMG.tv],
    specifications: { Screen: "43 inch, 3840 × 2160", Ports: "3 × HDMI, 2 × USB", Warranty: "2 years" },
  },
  {
    sku: "IMP-CMP-LAPTOP-I5", category: T.COMPUTERS_HARDWARE_PHONES, name: "14\" Laptop - Core i5, 16 GB, 512 GB SSD",
    description: "Slim laptop for work and study: Intel Core i5, 16 GB RAM, 512 GB SSD, full-HD screen, Windows 11.",
    origin: "Taiwan", packaging: "Retail box", unit: "piece", stockQty: 8, price: 239000, images: [IMG.laptop],
    specifications: { CPU: "Intel Core i5 (13th gen)", RAM: "16 GB", Storage: "512 GB SSD", Warranty: "1 year" },
  },
  {
    sku: "IMP-CMP-EARBUDS", category: T.COMPUTERS_HARDWARE_PHONES, name: "Wireless Earbuds with Noise Cancelling",
    description: "Bluetooth 5.3 earbuds with active noise cancelling, 30-hour battery and USB-C fast charging.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 50, price: 12900, images: [IMG.earbuds],
  },
  {
    sku: "IMP-CMP-PHONE-128", category: T.COMPUTERS_HARDWARE_PHONES, name: "6.1\" Smartphone 128 GB",
    description: "Dual-SIM 5G smartphone with a 6.1-inch OLED screen, 128 GB storage and a dual camera. Unlocked for all Sri Lankan networks.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 15, price: 129000, images: [IMG.phone],
    specifications: { Storage: "128 GB", Network: "5G, dual SIM", Warranty: "1 year" },
  },
  {
    sku: "IMP-CMP-SMARTWATCH", category: T.COMPUTERS_HARDWARE_PHONES, name: "Fitness Smartwatch with Heart-rate Monitor",
    description: "Tracks steps, sleep, heart rate and workouts, and shows calls and messages from your phone. 7-day battery.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 40, price: 15900, images: [IMG.smartwatch],
  },
  {
    sku: "IMP-CMP-HEADPHONES", category: T.COMPUTERS_HARDWARE_PHONES, name: "Over-ear Wireless Headphones",
    description: "Comfortable closed-back headphones with deep bass, 40-hour battery and a built-in microphone for calls.",
    origin: "China", packaging: "Retail box", unit: "piece", stockQty: 30, price: 17500, images: [IMG.headphones],
  },
  {
    sku: "IMP-FOO-OLIVE-OIL", category: T.FOOD_ITEMS, name: "Extra Virgin Olive Oil - 1 L",
    description: "Cold-extracted Spanish extra virgin olive oil in a dark glass bottle.",
    origin: "Spain", packaging: "1 L glass bottle", unit: "bottle", stockQty: 45, price: 5900, requiresPermit: true, images: [IMG.oliveOil],
  },
  {
    sku: "IMP-FOO-PASTA", category: T.FOOD_ITEMS, name: "Italian Durum Wheat Pasta Selection",
    description: "Spaghetti, tagliatelle and penne made from 100% durum wheat semolina, bronze-cut in Italy. 3 × 500 g.",
    origin: "Italy", packaging: "3 × 500 g packs", unit: "pack", stockQty: 60, price: 3250, requiresPermit: true, images: [IMG.pasta],
  },
  {
    sku: "IMP-FOO-DATES-1KG", category: T.FOOD_ITEMS, name: "Premium Medjool Dates - 1 kg",
    description: "Large, soft Medjool dates - naturally sweet and rich in fibre.",
    origin: "Jordan", packaging: "1 kg box", unit: "box", stockQty: 30, price: 7450, requiresPermit: true,
  },
  {
    sku: "IMP-TOO-DRILL-SET", category: T.POWER_HAND_TOOLS, name: "Cordless Drill Driver Kit 20 V",
    description: "Cordless drill with 2 batteries, a fast charger and 30 bits in a hard case.",
    origin: "China", packaging: "Hard carry case", unit: "kit", stockQty: 18, price: 24500, images: [IMG.drill],
    specifications: { Voltage: "20 V", Batteries: "2 × 2.0 Ah", Torque: "45 Nm" },
  },
  {
    sku: "IMP-TOO-SPANNERS", category: T.POWER_HAND_TOOLS, name: "Socket Wrench Set (40 pieces)",
    description: "Chrome-vanadium 1/4\" and 3/8\" sockets with a quick-release ratchet and extension bars, in a fitted case.",
    origin: "Taiwan", packaging: "Fitted carry case", unit: "set", stockQty: 22, price: 11950, images: [IMG.socketSet],
  },
  {
    sku: "IMP-TOO-HAND-TOOLS", category: T.POWER_HAND_TOOLS, name: "Workshop Hand Tool Collection (wholesale)",
    description: "Pliers, cutters, screwdrivers and chisels for hardware shops, by the carton. Tell us the mix you need for a quotation.",
    origin: "China / Taiwan", packaging: "Mixed cartons", unit: "carton", minimumOrderQty: 10, images: [IMG.handTools],
  },
];

// Labelled ("was") prices: shown crossed out next to the lower current price
const LABELLED_PRICES: Record<string, number> = {
  "EXP-TEA-BOPF-500": 11.5,
  "EXP-SPC-CINN-ALBA": 8.5,
  "EXP-SPC-MIX-GIFT": 24.9,
  "EXP-COF-ARABICA-250": 13.9,
  "EXP-CHO-GIFT-12": 19.5,
  "EXP-FRT-COCONUT-OIL": 10.5,
  "IMP-SPO-YOGA-MAT": 8950,
  "IMP-SPO-DUMBBELLS": 23500,
  "IMP-SPO-ROAD-BIKE": 189000,
  "IMP-SHO-RUNNING-M": 18900,
  "IMP-SHO-SNEAKER-U": 14500,
  "IMP-SHO-BOOTS-M": 27500,
  "IMP-CLO-TSHIRT": 3450,
  "IMP-CLO-BOMBER": 12900,
  "IMP-CLO-MAXI-DRESS": 15900,
  "IMP-FAN-LED-LIGHTS": 2450,
  "IMP-FAN-SUNGLASSES": 6500,
  "IMP-ELE-AIRFRYER": 34900,
  "IMP-ELE-STEAM-IRON": 9950,
  "IMP-ELE-SMART-TV-43": 165000,
  "IMP-CMP-LAPTOP-I5": 265000,
  "IMP-CMP-EARBUDS": 16900,
  "IMP-CMP-SMARTWATCH": 19900,
  "IMP-CMP-HEADPHONES": 21900,
  "IMP-TOO-DRILL-SET": 29900,
  "IMP-FOO-OLIVE-OIL": 6800,
};

async function save(product: Product, direction: TradeDirection) {
  const { price, currency, ...rest } = product;
  const fixed = price != undefined;
  const data = {
    ...rest,
    direction: direction,
    unit: product.unit ?? "pack",
    images: product.images ?? [],
    pricingMode: fixed ? PricingMode.FIXED : PricingMode.ON_REQUEST,
    price: fixed ? price : null,
    compareAtPrice: fixed ? (LABELLED_PRICES[product.sku] ?? null) : null,
    currency: fixed ? (currency ?? (direction == TradeDirection.EXPORT ? "USD" : "LKR")) : null,
    status: PublishStatus.PUBLISHED,
  };
  await prisma.tradeProduct.upsert({
    where: { sku: product.sku },
    create: data,
    update: data,
  });
  console.log(`✓ ${direction.padEnd(6)} ${product.sku.padEnd(22)} ${product.name}`);
}

async function main() {
  for (const product of EXPORTS) {
    await save(product, TradeDirection.EXPORT);
  }
  for (const product of IMPORTS) {
    await save(product, TradeDirection.IMPORT);
  }
  console.log(`\n${EXPORTS.length} export and ${IMPORTS.length} import products are published.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
