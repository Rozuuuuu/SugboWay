package domain

// Coordinate represents a WGS84 latitude and longitude pair.
type Coordinate struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// PassengerType specifies the LTFRB classification for fare metrics.
type PassengerType string

const (
	PassengerRegular PassengerType = "regular"
	PassengerStudent PassengerType = "student"
	PassengerSenior  PassengerType = "senior"
	PassengerPWD     PassengerType = "pwd"
)

// RouteMinimize specifies the optimization target for routing calculations.
type RouteMinimize string

const (
	MinimizeTime      RouteMinimize = "time"
	MinimizeTransfers RouteMinimize = "transfers"
	MinimizeFare      RouteMinimize = "fare"
	MinimizeWalking   RouteMinimize = "walking"
)

// RoutePrefs details custom parameters for Dijkstra graph relaxation.
type RoutePrefs struct {
	Minimize             RouteMinimize `json:"minimize"`
	PassengerType        PassengerType `json:"passengerType"`
	MaxWalkingMeters     float64       `json:"maxWalkingMeters"`
	AccessibilityMode    bool          `json:"accessibilityMode"`
	SafetyMode           bool          `json:"safetyMode"`
	AvoidRoutes          []string      `json:"avoidRoutes"`
	TransferPenaltySecs  float64       `json:"transferPenaltySecs"`
	DepartureTime        string        `json:"departureTime,omitempty"` // RFC3339 format
}

// GTFSRoute maps standard routes with Cebu specific attributes.
type GTFSRoute struct {
	RouteID        string `json:"routeId"`
	RouteShortName string `json:"routeShortName"`
	RouteLongName  string `json:"routeLongName"`
	RouteType      string `json:"routeType"` // "jeepney", "modern_ejeep", "mybus", "ceres", "bus"
	AgencyID       string `json:"agencyId"`
	RouteColor     string `json:"routeColor,omitempty"`
	IsModernized         bool   `json:"isModernized"`
	HasAircon            bool   `json:"hasAircon"`
	DailyPassengerVolume int    `json:"dailyPassengerVolume"`
	RoadType             string `json:"roadType"`
	RoadCapacity         int    `json:"roadCapacity"`
}

// GTFSStop maps standard stop nodes with spatial coordinates and PWD shelter flags.
type GTFSStop struct {
	StopID               string     `json:"stopId"`
	StopName             string     `json:"stopName"`
	Aliases              []string   `json:"aliases"`
	Location             Coordinate `json:"location"`
	RouteIDs             []string   `json:"routeIds"`
	WheelchairAccessible bool       `json:"wheelchairAccessible"`
	HasShelter           bool       `json:"hasShelter"`
	IsTerminal           bool       `json:"isTerminal"`
}

// NavigationInstruction stores turn-by-turn prompts snapped to cultural markers.
type NavigationInstruction struct {
	Step          int    `json:"step"`
	Action        string `json:"action"` // "walk", "board", "ride", "alight", "transfer", "wait"
	Description   string `json:"description"`
	CebuanoPhrase string `json:"cebuanoPhrase,omitempty"`
	CulturalCue   string `json:"culturalCue,omitempty"`
	Landmark      string `json:"landmark,omitempty"`
}

// RouteLeg is a segment of transit or pedestrian traversal.
type RouteLeg struct {
	Type            string                  `json:"type"` // "transit" | "walking"
	RouteID         string                  `json:"routeId,omitempty"`
	RouteShortName  string                  `json:"routeShortName,omitempty"`
	Route           *GTFSRoute              `json:"route,omitempty"`
	FromStop        GTFSStop                `json:"fromStop"`
	ToStop          GTFSStop                `json:"toStop"`
	DurationSeconds float64                 `json:"durationSeconds"`
	DistanceMeters  float64                 `json:"distanceMeters"`
	FarePHP         float64                 `json:"farePHP,omitempty"`
	Instructions    []NavigationInstruction `json:"instructions"`
}

// GeoJSONGeometry represents a simple spatial feature type.
type GeoJSONGeometry struct {
	Type        string      `json:"type"` // "LineString" | "Point"
	Coordinates interface{} `json:"coordinates"`
}

// GeoJSONFeature maps standard spatial records.
type GeoJSONFeature struct {
	Type       string           `json:"type"` // "Feature"
	Geometry   GeoJSONGeometry  `json:"geometry"`
	Properties map[string]interface{} `json:"properties,omitempty"`
}

// GeoJSONFeatureCollection represents the RAG fencing response format.
type GeoJSONFeatureCollection struct {
	Type     string           `json:"type"` // "FeatureCollection"
	Features []GeoJSONFeature `json:"features"`
}

// RouteResult describes a completed start-to-finish path.
type RouteResult struct {
	Legs             []RouteLeg               `json:"legs"`
	TotalTimeSeconds float64                  `json:"totalTimeSeconds"`
	TotalFarePHP     float64                  `json:"totalFarePHP"`
	Transfers        int                      `json:"transfers"`
	CrowdingWorstLeg float64                  `json:"crowdingWorstLeg"`
	GeoJSON          GeoJSONFeatureCollection `json:"geoJson"`
}
