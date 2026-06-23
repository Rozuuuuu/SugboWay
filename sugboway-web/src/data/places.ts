// Metro Cebu places for the location-aware picker.
// Coordinates are approximate hub centroids (good enough to zoom/snap the map
// and to seed nearby-stop lookups), not survey points. Aliases power local
// fuzzy search ("TC" -> USC Talamban, "srp" -> SM Seaside).

export type PlaceCategory =
  | "Mall"
  | "Business"
  | "University"
  | "Downtown"
  | "Terminal"
  | "Hospital"
  | "Landmark"
  | "District";

export interface Place {
  id: string;
  name: string; // canonical display name
  lat: number;
  lon: number;
  category: PlaceCategory;
  aliases: string[]; // lowercase alternate terms users actually type
}

export const CEBU_PLACES: Place[] = [
  // --- Malls & commercial ---
  { id: "ayala", name: "Ayala Center Cebu", lat: 10.318, lon: 123.905, category: "Mall", aliases: ["ayala", "ayala center", "ayala mall", "the terraces", "cebu business park"] },
  { id: "smcity", name: "SM City Cebu", lat: 10.312, lon: 123.918, category: "Mall", aliases: ["sm city", "sm cebu", "sm", "sm city cebu"] },
  { id: "seaside", name: "SM Seaside City", lat: 10.282, lon: 123.882, category: "Mall", aliases: ["sm seaside", "seaside", "srp", "sm seaside city"] },
  { id: "robinsons-galleria", name: "Robinsons Galleria Cebu", lat: 10.296, lon: 123.913, category: "Mall", aliases: ["robinsons galleria", "galleria", "rgc"] },
  { id: "robinsons-cybergate", name: "Robinsons Cybergate Cebu", lat: 10.312, lon: 123.894, category: "Mall", aliases: ["cybergate", "robinsons fuente", "robinsons cybergate"] },
  { id: "countrymall", name: "Gaisano Country Mall", lat: 10.339, lon: 123.913, category: "Mall", aliases: ["country mall", "gaisano country", "banilad mall"] },
  { id: "parkmall", name: "Parkmall", lat: 10.328, lon: 123.945, category: "Mall", aliases: ["parkmall", "park mall", "mandaue mall"] },
  { id: "jcentre", name: "J Centre Mall", lat: 10.334, lon: 123.940, category: "Mall", aliases: ["j centre", "jcentre", "j center mall"] },
  { id: "gaisano-capital-srp", name: "Il Corso / Gaisano SRP", lat: 10.275, lon: 123.876, category: "Mall", aliases: ["il corso", "gaisano srp", "filinvest srp"] },

  // --- Business / IT ---
  { id: "itpark", name: "Cebu IT Park", lat: 10.329, lon: 123.907, category: "Business", aliases: ["it park", "itpark", "the walk", "apas", "itp"] },
  { id: "ebloc", name: "eBloc Tower (IT Park)", lat: 10.330, lon: 123.906, category: "Business", aliases: ["ebloc", "e-bloc"] },

  // --- Universities ---
  { id: "usctc", name: "USC Talamban", lat: 10.352, lon: 123.912, category: "University", aliases: ["tc", "usc tc", "usc talamban", "university of san carlos talamban"] },
  { id: "usc-main", name: "USC Main (Downtown)", lat: 10.297, lon: 123.901, category: "University", aliases: ["usc main", "usc downtown", "san carlos main"] },
  { id: "usjr", name: "University of San Jose–Recoletos", lat: 10.299, lon: 123.896, category: "University", aliases: ["usjr", "san jose recoletos", "recoletos"] },
  { id: "uc-main", name: "University of Cebu (Main)", lat: 10.293, lon: 123.901, category: "University", aliases: ["uc main", "university of cebu", "uc sanciangko"] },
  { id: "uc-banilad", name: "University of Cebu (Banilad)", lat: 10.341, lon: 123.914, category: "University", aliases: ["uc banilad", "ucmed"] },
  { id: "citu", name: "Cebu Institute of Technology (CIT-U)", lat: 10.294, lon: 123.882, category: "University", aliases: ["cit", "citu", "cit-u", "cebu institute of technology"] },
  { id: "swu", name: "Southwestern University (SWU)", lat: 10.301, lon: 123.888, category: "University", aliases: ["swu", "southwestern", "urgello"] },
  { id: "cdu", name: "Cebu Doctors' University", lat: 10.282, lon: 123.875, category: "University", aliases: ["cdu", "cebu doctors university", "mandaue cdu"] },
  { id: "up-cebu", name: "UP Cebu", lat: 10.323, lon: 123.901, category: "University", aliases: ["up cebu", "up lahug"] },

  // --- Downtown & landmarks ---
  { id: "colon", name: "Colon Street (Metro)", lat: 10.297, lon: 123.899, category: "Downtown", aliases: ["colon", "metro colon", "downtown"] },
  { id: "carbon", name: "Carbon Market", lat: 10.293, lon: 123.901, category: "Downtown", aliases: ["carbon", "carbon market", "carbon public market"] },
  { id: "santo-nino", name: "Basilica del Santo Niño", lat: 10.294, lon: 123.902, category: "Landmark", aliases: ["santo nino", "sto nino", "basilica", "simbahan sa sto nino"] },
  { id: "magellan", name: "Magellan's Cross", lat: 10.293, lon: 123.902, category: "Landmark", aliases: ["magellan cross", "magellans cross", "tugon"] },
  { id: "fuente", name: "Fuente Osmeña Circle", lat: 10.310, lon: 123.892, category: "Landmark", aliases: ["fuente", "fuente osmena", "osmena circle"] },
  { id: "capitol", name: "Cebu Provincial Capitol", lat: 10.318, lon: 123.891, category: "Landmark", aliases: ["capitol", "capitol site", "provincial capitol"] },
  { id: "plaza-indep", name: "Plaza Independencia", lat: 10.293, lon: 123.906, category: "Landmark", aliases: ["plaza independencia", "plaza", "fort san pedro"] },
  { id: "heritage", name: "Heritage of Cebu Monument", lat: 10.296, lon: 123.903, category: "Landmark", aliases: ["heritage monument", "parian heritage", "parian"] },
  { id: "jysquare", name: "JY Square Mall (Lahug)", lat: 10.331, lon: 123.897, category: "Landmark", aliases: ["jy square", "jy", "lahug jy"] },

  // --- Terminals & transport ---
  { id: "csbt", name: "Cebu South Bus Terminal", lat: 10.298, lon: 123.890, category: "Terminal", aliases: ["csbt", "south bus terminal", "south terminal", "bisaya terminal"] },
  { id: "cnbt", name: "Cebu North Bus Terminal", lat: 10.328, lon: 123.937, category: "Terminal", aliases: ["cnbt", "north bus terminal", "north terminal"] },
  { id: "pier", name: "Port of Cebu (Piers)", lat: 10.295, lon: 123.910, category: "Terminal", aliases: ["pier", "port", "cebu port", "pier 1", "wharf"] },

  // --- Hospitals ---
  { id: "chong-hua", name: "Chong Hua Hospital (Fuente)", lat: 10.311, lon: 123.893, category: "Hospital", aliases: ["chong hua", "chonghua", "chong hua fuente"] },
  { id: "vsmmc", name: "Vicente Sotto Medical Center", lat: 10.300, lon: 123.887, category: "Hospital", aliases: ["vsmmc", "vicente sotto", "sotto hospital"] },
  { id: "perpetual", name: "Perpetual Succour Hospital", lat: 10.305, lon: 123.901, category: "Hospital", aliases: ["perpetual", "perpetual succour", "gorordo hospital"] },
  { id: "cdh", name: "Cebu Doctors' Hospital (Osmeña)", lat: 10.309, lon: 123.890, category: "Hospital", aliases: ["cebu doctors hospital", "cdh", "perpetual doctors"] },

  // --- Districts / barangays ---
  { id: "lahug", name: "Lahug", lat: 10.331, lon: 123.897, category: "District", aliases: ["lahug"] },
  { id: "banilad", name: "Banilad", lat: 10.340, lon: 123.912, category: "District", aliases: ["banilad"] },
  { id: "mabolo", name: "Mabolo", lat: 10.317, lon: 123.916, category: "District", aliases: ["mabolo"] },
  { id: "talamban", name: "Talamban", lat: 10.366, lon: 123.917, category: "District", aliases: ["talamban", "talamban proper"] },
  { id: "guadalupe", name: "Guadalupe", lat: 10.314, lon: 123.880, category: "District", aliases: ["guadalupe", "guada"] },
  { id: "labangon", name: "Labangon", lat: 10.302, lon: 123.879, category: "District", aliases: ["labangon"] },
  { id: "mambaling", name: "Mambaling", lat: 10.293, lon: 123.876, category: "District", aliases: ["mambaling"] },
  { id: "pardo", name: "Pardo", lat: 10.283, lon: 123.866, category: "District", aliases: ["pardo"] },
  { id: "bulacao", name: "Bulacao", lat: 10.274, lon: 123.859, category: "District", aliases: ["bulacao"] },
  { id: "mandaue", name: "Mandaue City", lat: 10.323, lon: 123.942, category: "District", aliases: ["mandaue", "mandaue city"] },
];

// Rank a place against a lowercase query. Higher is better; 0 means no match.
function scorePlace(place: Place, q: string): number {
  const name = place.name.toLowerCase();
  if (name === q) return 100;
  if (place.aliases.includes(q)) return 95; // exact alias ("tc" -> USC Talamban)
  if (name.startsWith(q)) return 80;

  let best = 0;
  if (name.includes(q)) best = Math.max(best, 50);
  for (const alias of place.aliases) {
    if (alias.startsWith(q)) best = Math.max(best, 60);
    else if (alias.includes(q)) best = Math.max(best, 30);
  }
  return best;
}

// Fuzzy search over the hub list. Empty query returns a sensible starter set.
export function searchPlaces(query: string, limit = 7): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return CEBU_PLACES.slice(0, limit);

  return CEBU_PLACES.map((place) => ({ place, score: scorePlace(place, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.place);
}
