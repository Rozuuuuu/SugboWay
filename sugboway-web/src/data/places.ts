// Primary Cebu hubs for the location-aware place picker.
// Coordinates are [lon, lat] in the table below but stored as explicit fields
// to avoid ordering mistakes. Aliases power local fuzzy search ("TC" -> USC Talamban).

export interface Place {
  id: string;
  name: string; // canonical display name
  lat: number;
  lon: number;
  category: "Mall" | "Business" | "University" | "Downtown";
  aliases: string[]; // lowercase alternate terms users actually type
}

export const CEBU_PLACES: Place[] = [
  {
    id: "ayala",
    name: "Ayala Center Cebu",
    lat: 10.318,
    lon: 123.905,
    category: "Mall",
    aliases: ["ayala", "ayala center", "ayala mall", "the terraces"],
  },
  {
    id: "itpark",
    name: "Cebu IT Park",
    lat: 10.329,
    lon: 123.907,
    category: "Business",
    aliases: ["it park", "itpark", "the walk", "apas", "itp"],
  },
  {
    id: "smcity",
    name: "SM City Cebu",
    lat: 10.312,
    lon: 123.918,
    category: "Mall",
    aliases: ["sm city", "sm cebu", "sm", "sm city cebu"],
  },
  {
    id: "usctc",
    name: "USC Talamban",
    lat: 10.352,
    lon: 123.912,
    category: "University",
    aliases: ["tc", "usc tc", "usc talamban", "talamban", "university of san carlos"],
  },
  {
    id: "colon",
    name: "Colon (Metro)",
    lat: 10.297,
    lon: 123.899,
    category: "Downtown",
    aliases: ["colon", "metro colon", "downtown", "carbon", "parian"],
  },
  {
    id: "seaside",
    name: "SM Seaside",
    lat: 10.282,
    lon: 123.882,
    category: "Mall",
    aliases: ["sm seaside", "seaside", "srp", "sm seaside city"],
  },
];

// Rank a place against a lowercase query. Higher is better; 0 means no match.
function scorePlace(place: Place, q: string): number {
  const name = place.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;

  // Exact alias is a strong signal ("tc" -> USC Talamban)
  if (place.aliases.includes(q)) return 90;

  let best = 0;
  if (name.includes(q)) best = Math.max(best, 50);
  for (const alias of place.aliases) {
    if (alias.startsWith(q)) best = Math.max(best, 60);
    else if (alias.includes(q)) best = Math.max(best, 30);
  }
  return best;
}

// Fuzzy search over the hub list. Empty query returns the full list.
export function searchPlaces(query: string, limit = 6): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return CEBU_PLACES.slice(0, limit);

  return CEBU_PLACES.map((place) => ({ place, score: scorePlace(place, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.place);
}
