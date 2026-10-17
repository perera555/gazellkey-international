import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PublishStatus } from "@/app/generated/prisma/enums";
import { handleError } from "@/utils/handleError";

type Place = { name: string; count: number; hotels?: { slug: string; name: string }[] };
type Country = { country: string; count: number; places: Place[] };

// GET /api/travel/places - the website's country -> place pickers. Public.
//   tours:  countries -> tour destinations (tours without a country are
//           listed under their destination)
//   hotels: countries -> cities -> hotels
export async function GET() {
  try {
    const [tours, hotels] = await Promise.all([
      prisma.tourPackage.findMany({
        where: { status: PublishStatus.PUBLISHED },
        select: { country: true, destination: true },
      }),
      prisma.hotel.findMany({
        where: { status: PublishStatus.PUBLISHED },
        select: { country: true, city: true, slug: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const tourPlaces = group(
      tours.map((tour) => ({
        country: tour.country?.trim() || tour.destination.trim(),
        place: tour.destination.trim(),
      })),
    );
    const hotelPlaces = group(
      hotels.map((hotel) => ({
        country: hotel.country.trim(),
        place: hotel.city.trim(),
        hotel: { slug: hotel.slug, name: hotel.name },
      })),
    );

    return NextResponse.json({ message: "Places fetched", data: { tours: tourPlaces, hotels: hotelPlaces } });
  } catch (error) {
    return handleError(error);
  }
}

// rows -> countries (A-Z) -> places (A-Z) with counts; first spelling wins
function group(rows: { country: string; place: string; hotel?: { slug: string; name: string } }[]): Country[] {
  const countries = new Map<string, Country>();
  for (const row of rows) {
    if (!row.country || !row.place) continue;
    const countryKey = row.country.toLowerCase();
    if (!countries.has(countryKey)) countries.set(countryKey, { country: row.country, count: 0, places: [] });
    const country = countries.get(countryKey)!;
    country.count += 1;
    let place = country.places.find((each) => each.name.toLowerCase() == row.place.toLowerCase());
    if (!place) {
      place = { name: row.place, count: 0, ...(row.hotel ? { hotels: [] } : {}) };
      country.places.push(place);
    }
    place.count += 1;
    if (row.hotel) place.hotels!.push(row.hotel);
  }
  return [...countries.values()]
    .map((country) => ({ ...country, places: country.places.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.country.localeCompare(b.country));
}
