// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  descriptionImprovementRequestSchema,
  descriptionImprovementSchema,
} from "@/lib/ai-description";

describe("AI description validation", () => {
  it("trims and accepts a line-item description", () => {
    expect(descriptionImprovementRequestSchema.parse({ description: "  Website design  " })).toEqual({
      description: "Website design",
    });
  });

  it("rejects empty and oversized descriptions", () => {
    expect(descriptionImprovementRequestSchema.safeParse({ description: "  " }).success).toBe(false);
    expect(descriptionImprovementRequestSchema.safeParse({ description: "x".repeat(501) }).success).toBe(false);
  });

  it("validates a structured model response", () => {
    const improvement = {
      suggestion: "Responsive website design and implementation",
      explanation: "Clarifies the scope while preserving the original meaning.",
      changed: true,
    };

    expect(descriptionImprovementSchema.parse(improvement)).toEqual(improvement);
    expect(descriptionImprovementSchema.safeParse({ ...improvement, changed: "yes" }).success).toBe(false);
  });
});
