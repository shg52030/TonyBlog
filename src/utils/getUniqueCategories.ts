import type { CollectionEntry } from "astro:content";
import { categoryDefinitions } from "@/data/categories";
import { postFilter } from "./postFilter";
import { slugifyStr } from "./slugify";

/** Label used for posts that don't declare a `category` in frontmatter. */
export const UNCATEGORIZED_NAME = "未分类";

/** Stable, URL-friendly slug for the fallback category. */
export const UNCATEGORIZED_SLUG = "uncategorized";

export type Category = {
  /** Slug used in URLs, e.g. "系统运维" -> "系统运维" */
  category: string;
  /** Original label shown in the UI */
  categoryName: string;
  /** Number of published posts in this category */
  count: number;
  /** Short description, only defined for categories declared in `src/data/categories.ts` */
  description?: string;
};

/** Returns the display name of a post's category, falling back to "未分类". */
export function getCategoryName(post: CollectionEntry<"posts">): string {
  const name = post.data.category?.trim();
  return name ? name : UNCATEGORIZED_NAME;
}

/**
 * Returns the URL slug for a category display name.
 *
 * Categories declared in `src/data/categories.ts` may pin their own slug
 * (`{ name: "AI 应用", slug: "ai" }`); everything else is slugified from the name.
 */
export function getCategorySlug(categoryName: string): string {
  if (categoryName === UNCATEGORIZED_NAME) return UNCATEGORIZED_SLUG;

  const declared = categoryDefinitions.find(item => item.name === categoryName);
  return declared?.slug?.trim() || slugifyStr(categoryName);
}

/**
 * Builds the category list shown in the sidebar and on /categories/.
 *
 * - The order and the full set of categories come from
 *   `src/data/categories.ts`, so a category with zero posts still shows up.
 * - Posts without `category` are grouped under "未分类" (only if any exist).
 * - A category used in a post but missing from the registry is appended at the
 *   end instead of being dropped, so a typo never hides an article.
 * - Drafts and scheduled posts are excluded via `postFilter()`.
 */
export function getUniqueCategories(
  posts: CollectionEntry<"posts">[]
): Category[] {
  const counts = new Map<string, { categoryName: string; count: number }>();

  posts.filter(postFilter).forEach(post => {
    const categoryName = getCategoryName(post);
    const slug = getCategorySlug(categoryName);
    const existing = counts.get(slug);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { categoryName, count: 1 });
    }
  });

  const categories: Category[] = [];
  const seen = new Set<string>();

  // 1. Declared categories, in the order written in src/data/categories.ts
  categoryDefinitions.forEach(({ name, description }) => {
    const slug = getCategorySlug(name);

    // Guard against duplicated names and against shadowing the fallback slug
    if (seen.has(slug) || slug === UNCATEGORIZED_SLUG) return;
    seen.add(slug);

    categories.push({
      category: slug,
      categoryName: name,
      count: counts.get(slug)?.count ?? 0,
      description,
    });
  });

  // 2. Undeclared categories found in posts, appended so nothing goes missing
  [...counts.entries()]
    .filter(([slug]) => !seen.has(slug) && slug !== UNCATEGORIZED_SLUG)
    .sort(
      ([, a], [, b]) =>
        b.count - a.count ||
        a.categoryName.localeCompare(b.categoryName, "zh-CN")
    )
    .forEach(([slug, { categoryName, count }]) => {
      seen.add(slug);
      categories.push({ category: slug, categoryName, count });
    });

  // 3. "未分类" always last, and only when there is something in it
  const uncategorized = counts.get(UNCATEGORIZED_SLUG);
  if (uncategorized) {
    categories.push({
      category: UNCATEGORIZED_SLUG,
      categoryName: UNCATEGORIZED_NAME,
      count: uncategorized.count,
    });
  }

  return categories;
}
