import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PublishStatus, VehicleListingType } from "@/app/generated/prisma/enums";
import { handleError } from "@/utils/handleError";

type ModelCount = { model: string; vehicles: number; parts: number };

// Public "browse by make & model" list for the website's vehicles page.
// GET /api/vehicles/models ->
//   { data: [{ make: "Toyota", vehicles: 3, parts: 5,
//              models: [{ model: "Aqua", vehicles: 1, parts: 4 }, ...] }] }
// Vehicles count by their own make + model. Spare parts count for every
// model in their "compatible with" list ("Toyota Aqua" = make Toyota, model
// Aqua), or for their own make + model when the list is empty.
export async function GET() {
  try {
    const listings = await prisma.vehicleListing.findMany({
      where: { status: PublishStatus.PUBLISHED },
      select: { listingType: true, make: true, model: true, compatibleWith: true },
    });

    // keyed by lower-case make, then lower-case model; first spelling wins
    const makes = new Map<string, { make: string; models: Map<string, ModelCount> }>();

    function add(make: string | null, model: string | null, field: "vehicles" | "parts") {
      const makeName = make?.trim();
      const modelName = model?.trim();
      if (!makeName || !modelName) {
        return;
      }
      const makeKey = makeName.toLowerCase();
      if (!makes.has(makeKey)) {
        makes.set(makeKey, { make: makeName, models: new Map() });
      }
      const models = makes.get(makeKey)!.models;
      const modelKey = modelName.toLowerCase();
      if (!models.has(modelKey)) {
        models.set(modelKey, { model: modelName, vehicles: 0, parts: 0 });
      }
      models.get(modelKey)![field] += 1;
    }

    for (const listing of listings) {
      if (listing.listingType != VehicleListingType.SPARE_PART) {
        add(listing.make, listing.model, "vehicles");
        continue;
      }
      const fits = listing.compatibleWith.filter((entry) => entry.trim().includes(" "));
      if (fits.length == 0) {
        add(listing.make, listing.model, "parts");
      }
      for (const entry of fits) {
        const [make, ...model] = entry.trim().split(/\s+/);
        add(make, model.join(" "), "parts");
      }
    }

    const data = [...makes.values()]
      .map(({ make, models }) => {
        const list = [...models.values()].sort((a, b) => a.model.localeCompare(b.model));
        return {
          make,
          vehicles: list.reduce((sum, each) => sum + each.vehicles, 0),
          parts: list.reduce((sum, each) => sum + each.parts, 0),
          models: list,
        };
      })
      .sort((a, b) => a.make.localeCompare(b.make));

    return NextResponse.json({ message: "Models fetched", data: data });
  } catch (error) {
    return handleError(error);
  }
}
