import { Division, TradeDirection } from "@/app/generated/prisma/enums";

// Import and Export are separate divisions on one shared trade model
export function divisionOf(direction: TradeDirection) {
  return direction == TradeDirection.IMPORT ? Division.IMPORT : Division.EXPORT;
}

export function directionOf(division: Division): TradeDirection | null {
  if (division == Division.IMPORT) {
    return TradeDirection.IMPORT;
  }
  if (division == Division.EXPORT) {
    return TradeDirection.EXPORT;
  }
  return null;
}
