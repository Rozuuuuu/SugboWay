import { calculateFare, formatPHP, FARE_CONSTANTS } from "../../domain/fare";

// NOTE ON TEST CORRECTIONS
// -------------------------
// The task brief's sample tests assumed a signature of
// `calculateFare(distanceKm, passengerType, routeType)` returning a
// `FareBreakdown` with `totalPHP` / `discountPHP` fields. The real,
// shipping implementation in `domain/fare.ts` is:
//
//   calculateFare(distanceKm: number, passengerType: PassengerType, transfers: number): FareBreakdown
//
// The third argument is the number of vehicle transfers (0 = direct route),
// not a route-type string like "jeepney" — passing a string there fails to
// typecheck. The returned `FareBreakdown` has `totalFare`, `distanceSurcharge`,
// `discountRate`, and `discountedLegFare` — there is no `totalPHP` or
// `discountPHP` field. Tests below are written against the actual shape.

describe("calculateFare", () => {
  it("charges exactly the base fare for a short regular trip within the free distance", () => {
    // distanceKm (2) <= FREE_DISTANCE_KM (4), so no surcharge applies.
    // See domain/fare.ts lines 116-120.
    const fare = calculateFare(2, "regular", 0);
    expect(fare.totalFare).toBe(FARE_CONSTANTS.BASE_FARE_PHP); // 13.00
    expect(fare.distanceSurcharge).toBe(0);
    expect(fare.discountRate).toBe(0);
  });

  it("applies the statutory 20% discount for students, seniors, and PWDs", () => {
    // domain/fare.ts DISCOUNT_RATE = 0.2 (line 27), applied via getDiscountRate.
    const regular = calculateFare(10, "regular", 0);
    // rawLegFare = 13 + (10-4)*1.8 = 23.80
    expect(regular.totalFare).toBe(23.8);
    expect(regular.discountRate).toBe(0);

    for (const type of ["student", "senior", "pwd"] as const) {
      const discounted = calculateFare(10, type, 0);
      expect(discounted.discountRate).toBe(0.2);
      // discountedLegFare = roundPHP(23.80 * 0.80) = 19.04
      expect(discounted.totalFare).toBe(19.04);
      expect(discounted.totalFare).toBeLessThan(regular.totalFare);
    }
  });

  it("increases fare with distance beyond the free 4km band", () => {
    // domain/fare.ts SURCHARGE_PER_KM = 1.8 applied to (distance - FREE_DISTANCE_KM).
    const far = calculateFare(20, "regular", 0);
    const near = calculateFare(5, "regular", 0);
    // far: 13 + (20-4)*1.8 = 41.80 ; near: 13 + (5-4)*1.8 = 14.80
    expect(far.totalFare).toBe(41.8);
    expect(near.totalFare).toBe(14.8);
    expect(far.totalFare).toBeGreaterThan(near.totalFare);
  });

  it("multiplies the per-leg fare by the number of vehicles boarded (transfers + 1)", () => {
    // domain/fare.ts lines 129-132: legsCount = transfers + 1, totalFare = discountedLegFare * legsCount.
    const direct = calculateFare(2, "regular", 0);
    const oneTransfer = calculateFare(2, "regular", 1);
    expect(direct.perLeg).toEqual([13]);
    expect(oneTransfer.perLeg).toEqual([13, 13]);
    expect(oneTransfer.totalFare).toBe(direct.totalFare * 2);
  });
});

describe("formatPHP", () => {
  it("renders a peso-prefixed amount with 2 decimal places", () => {
    // domain/fare.ts formatPHP: `₱${amount.toFixed(2)}`
    expect(formatPHP(13)).toBe("₱13.00");
    expect(formatPHP(19.04)).toBe("₱19.04");
  });
});
