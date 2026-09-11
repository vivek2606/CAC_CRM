import { prisma } from "@/lib/prisma";

// Powers the Category/Sub-Category creatable dropdowns on the product forms -
// the existing distinct values already in the catalog, offered as
// suggestions alongside the option to type a brand-new one.
export async function getProductCategoryOptions() {
  const [categories, subCategories] = await Promise.all([
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.product.findMany({ distinct: ["subCategory"], select: { subCategory: true }, orderBy: { subCategory: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => c.category),
    subCategories: subCategories.map((s) => s.subCategory),
  };
}
