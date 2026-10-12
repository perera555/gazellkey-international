import { NextRequest } from "next/server";
import { ApiError } from "@/utils/handleError";

// Second argument of a route handler inside a [id] folder
export type IdContext = { params: Promise<{ id: string }> };

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function searchParam(request: NextRequest, name: string) {
  const value = request.nextUrl.searchParams.get(name)?.trim();
  return value ? value : undefined;
}

// ?status=NEW -> "NEW", checked against a Prisma enum. Wrong value = 400.
export function enumParam<T extends Record<string, string>>(
  request: NextRequest,
  name: string,
  enumObject: T,
): T[keyof T] | undefined {
  const value = searchParam(request, name);
  if (value == undefined) {
    return undefined;
  }
  if (!Object.values(enumObject).includes(value)) {
    throw new ApiError(
      400,
      `${name} must be one of: ${Object.values(enumObject).join(", ")}`,
    );
  }
  return value as T[keyof T];
}

export function dateParam(request: NextRequest, name: string) {
  const value = searchParam(request, name);
  if (value == undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${name} must be a valid date (YYYY-MM-DD)`);
  }
  return date;
}

// ?from=2026-01-01&to=2026-12-31 -> Prisma filter for createdAt
export function dateRangeFilter(request: NextRequest) {
  const from = dateParam(request, "from");
  const to = dateParam(request, "to");
  if (from == undefined && to == undefined) {
    return undefined;
  }
  if (to) {
    to.setHours(23, 59, 59, 999); // include the whole "to" day
  }
  return { gte: from, lte: to };
}
