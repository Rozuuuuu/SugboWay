import { volumeToScore, classifyCrowding, CROWDING_THRESHOLDS } from "../../domain/crowding";

// The brief's sample assertions for this file matched the real implementation
// in domain/crowding.ts as written — no corrections were needed here. The
// thresholds below are asserted directly against CROWDING_THRESHOLDS
// (COMFORTABLE_MAX 0.3, MODERATE_MAX 0.6, CROWDED_MAX 0.8, see
// domain/crowding.ts lines 34-39) rather than only checking relative order.

describe("volumeToScore", () => {
  it("returns 0 for an empty vehicle and clamps an over-capacity one to 1", () => {
    // domain/crowding.ts lines 110-115: ratio = volume/capacity, Math.min(ratio, 1.0)
    expect(volumeToScore(0, 100)).toBe(0);
    expect(volumeToScore(500, 100)).toBe(1); // 500/100 = 5, clamped to 1
  });

  it("returns the raw ratio when under capacity", () => {
    expect(volumeToScore(50, 100)).toBe(0.5);
  });

  it("returns 0 when capacity is zero or negative", () => {
    // domain/crowding.ts line 111: `if (capacity <= 0) return 0;`
    expect(volumeToScore(10, 0)).toBe(0);
    expect(volumeToScore(10, -5)).toBe(0);
  });
});

describe("classifyCrowding", () => {
  it("classifies an empty vehicle as comfortable and an over-capacity one as packed", () => {
    expect(classifyCrowding(0.05).level).toBe("comfortable");
    expect(classifyCrowding(0.98).level).toBe("packed");
  });

  it("classifies scores exactly at each threshold boundary (inclusive upper bound)", () => {
    // domain/crowding.ts uses `<=` comparisons, so the *_MAX values themselves
    // belong to the lower band, not the next one.
    expect(classifyCrowding(CROWDING_THRESHOLDS.COMFORTABLE_MAX).level).toBe("comfortable"); // 0.3
    expect(classifyCrowding(CROWDING_THRESHOLDS.COMFORTABLE_MAX + 0.01).level).toBe("moderate");
    expect(classifyCrowding(CROWDING_THRESHOLDS.MODERATE_MAX).level).toBe("moderate"); // 0.6
    expect(classifyCrowding(CROWDING_THRESHOLDS.MODERATE_MAX + 0.01).level).toBe("crowded");
    expect(classifyCrowding(CROWDING_THRESHOLDS.CROWDED_MAX).level).toBe("crowded"); // 0.8
    expect(classifyCrowding(CROWDING_THRESHOLDS.CROWDED_MAX + 0.01).level).toBe("packed");
  });

  it("clamps out-of-range scores into [0, 1] before classifying", () => {
    // domain/crowding.ts line 132: Math.max(0, Math.min(1, score))
    expect(classifyCrowding(-5).level).toBe("comfortable");
    expect(classifyCrowding(5).level).toBe("packed");
  });

  it("returns a monotonically non-decreasing severity across the range", () => {
    const order = ["comfortable", "moderate", "crowded", "packed"];
    const levels = [0, 0.25, 0.5, 0.75, 1].map((s) => order.indexOf(classifyCrowding(s).level));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it("marks only the packed level for pulsing", () => {
    expect(classifyCrowding(0.1).shouldPulse).toBe(false);
    expect(classifyCrowding(0.9).shouldPulse).toBe(true);
  });
});
