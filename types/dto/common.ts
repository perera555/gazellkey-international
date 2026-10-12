import { z } from "zod";

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code like USD or LKR");

export const moneySchema = z.number().nonnegative().max(1_000_000_000);

export const idSchema = z.uuid("Invalid id");

// free-form JSON object (division-specific details, specifications ...)
export const jsonObjectSchema = z.record(z.string(), z.any());

export const imageListSchema = z.array(z.string().trim().min(1)).max(30);

type UpdateShape<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<
    T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K]
  >;
};

// Builds an update schema from a create schema: every field optional and
// NO default values. (Zod 4's .partial() keeps defaults, which would reset
// fields such as status to DRAFT on every update.)
export function toUpdateSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = (inner as z.ZodType).optional();
  }
  return z.object(shape).strict() as unknown as z.ZodObject<UpdateShape<T>>;
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may contain a-z, 0-9 and dashes");
