import { fetchAllRoutes, fetchRouteStops, searchRoutes } from "../../lib/api";

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

describe("api client", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns [] when route search 404s (no scheduled-graph route is normal)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      { ok: false, status: 404, json: () => Promise.resolve(null) } as Response
    );
    await expect(
      searchRoutes({ lat: 10.36, lon: 123.91 }, { lat: 10.29, lon: 123.89 }, "regular", false)
    ).resolves.toEqual([]);
  });

  it("unwraps nearbyStops-shaped stop responses", async () => {
    jest.spyOn(global, "fetch").mockReturnValue(okJson({ stops: [{ stopId: "s1" }] }));
    await expect(fetchRouteStops("13C")).resolves.toHaveLength(1);
  });

  it("rejects on a 500 from route search", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      { ok: false, status: 500, json: () => Promise.resolve(null) } as Response
    );
    await expect(
      searchRoutes({ lat: 10.36, lon: 123.91 }, { lat: 10.29, lon: 123.89 }, "regular", false)
    ).rejects.toThrow(/500/);
  });

  // Live GET /api/v1/routes returns { count, routes: [...] }, not a bare array —
  // pins the unwrap so a future edit can't silently regress back to the wrapper.
  it("unwraps the { count, routes } wrapper from GET /routes", async () => {
    jest.spyOn(global, "fetch").mockReturnValue(
      okJson({ count: 2, routes: [{ routeId: "13C" }, { routeId: "04L" }] })
    );
    const routes = await fetchAllRoutes();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes).toHaveLength(2);
  });
});
