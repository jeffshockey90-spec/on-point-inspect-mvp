import { describe, it, expect } from "vitest";
import { pickNewestReview } from "./googlePlaces";

// Regression: the review-alert cron used to build the notification from the New
// Places API's reviews[0], which is "most relevant" order — so a brand-new
// review fired an alert that named an OLD, highly-rated review. The alert must
// name the genuinely newest review, by publish time.

type R = { author_name: string; publish_time?: string | null; rating?: number };

describe("pickNewestReview", () => {
  it("returns undefined for an empty or missing set", () => {
    expect(pickNewestReview([])).toBeUndefined();
    expect(pickNewestReview(undefined as unknown as R[])).toBeUndefined();
  });

  it("picks the most recent by publish_time regardless of array order", () => {
    const reviews: R[] = [
      { author_name: "Old Relevant", publish_time: "2024-01-01T00:00:00Z", rating: 5 },
      { author_name: "Brand New", publish_time: "2026-11-13T07:50:00Z", rating: 5 },
      { author_name: "Middle", publish_time: "2025-06-01T00:00:00Z", rating: 4 },
    ];
    // "most relevant" order would wrongly return reviews[0] (Old Relevant).
    expect(pickNewestReview(reviews)?.author_name).toBe("Brand New");
  });

  it("prefers a review with a real timestamp over one with a missing/unparseable one", () => {
    const reviews: R[] = [
      { author_name: "No Date", publish_time: null },
      { author_name: "Dated", publish_time: "2026-11-01T00:00:00Z" },
      { author_name: "Junk Date", publish_time: "not-a-date" },
    ];
    expect(pickNewestReview(reviews)?.author_name).toBe("Dated");
  });

  it("is stable when a single review has no timestamp", () => {
    const reviews: R[] = [{ author_name: "Solo", publish_time: null }];
    expect(pickNewestReview(reviews)?.author_name).toBe("Solo");
  });
});
