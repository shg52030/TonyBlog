import type { CollectionEntry } from "astro:content";
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
};

/** Returns the display name of a post's category, falling back to "未分类". */
export function getCategoryName(post: CollectionEntry<"posts">): string {
  const name = post.data.category?.trim();
  return name ? name : UNCATEGORIZED_NAME;
}

/** Returns the URL slug for a category display name. */
export function getCategorySlug(categoryName: string): string {
  return categoryName === UNCATEGORIZED_NAME
    ? UNCATEGORIZED_SLUG
    : slugifyStr(categoryName);
}

/**
 * Builds a de-duplicated category list with post counts.
 *
 * - Drafts and scheduled posts are excluded via `postFilter()`
 * - Posts without `category` are grouped under "未分类"
 * - Sorted by post count (desc), then by name; "未分类" always last
 */
export function getUniqueCategories(
  posts: CollectionEntry<"posts">[]
): Category[] {
  const categories = new Map<string, Category>();

  posts.filter(postFilter).forEach(post => {
    const categoryName = getCategoryName(post);
    const category = getCategorySlug(categoryName);
    const existing = categories.get(category);

    if (existing) {
      existing.count += 1;
    } else {
      categories.set(category, { category, categoryName, count: 1 });
    }
  });

  return [...categories.values()].sort((a, b) => {
    if (a.categoryName === UNCATEGORIZED_NAME) return 1;
    if (b.categoryName === UNCATEGORIZED_NAME) return -1;
    return (
      b.count - a.count || a.categoryName.localeCompare(b.categoryName, "zh-CN")
    );
  });
}
