import { z } from "zod";

export const productSchema = z.object({
  code: z.string().min(1, "Product code is required"),
  brand: z.string().min(1, "Brand is required"),
  category: z.string().min(1, "Category is required"),
  subCategory: z.string().min(1, "Sub-category is required"),
  model: z.string().min(1, "Model is required"),
  capacityKw: z.coerce.number().min(0).nullable(),
});

export const pricelistEntrySchema = z.object({
  month: z.string().min(1, "Month is required"),
  dealerPrice: z.coerce.number().min(0),
  landedPrice: z.coerce.number().min(0).nullable(),
});
