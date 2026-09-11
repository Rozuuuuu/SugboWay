import { fetchRouteStops, searchRoutes } from "../../lib/api";

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
});
