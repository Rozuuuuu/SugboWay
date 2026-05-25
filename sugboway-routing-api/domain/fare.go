package domain

import (
	"math"
)

// Fare rules constants per LTFRB regulations
const (
	BaseFarePHP       = 13.00
	BaseDistanceLimit = 4000.0 // 4km in meters
	DiscountFactor    = 0.20   // 20% discount
)

// CalculateLegFare computes the deterministic price for a single transit ride segment.
// It applies distance-based surcharges, vehicle type premiums, and express base overlays.
func CalculateLegFare(distanceMeters float64, routeType string, routeID string, passengerType PassengerType) float64 {
	// 1. Handle Express overrides (e.g., SM Seaside - Ayala Center Cebu flat fare)
	if routeID == "mybus_srp" {
		flatFare := 25.00
		if passengerType != PassengerRegular {
			flatFare = flatFare * (1.0 - DiscountFactor)
		}
		return math.Round(flatFare*100) / 100
	}

	// 2. Select per-kilometer surcharge based on LTFRB specifications
	// Traditional jeepneys utilize a lower rate; modern and aircon express lines charge a premium.
	surchargePerMeter := 0.0020 // ₱2.00 per km (Traditional)
	switch routeType {
	case "modern_ejeep":
		surchargePerMeter = 0.0025 // ₱2.50 per km (Modern)
	case "mybus", "ceres", "bus":
		surchargePerMeter = 0.0030 // ₱3.00 per km (Express / Coach)
	}

	fare := BaseFarePHP

	// Add surcharge for distance beyond 4 kilometers
	if distanceMeters > BaseDistanceLimit {
		excessMeters := distanceMeters - BaseDistanceLimit
		fare += excessMeters * surchargePerMeter
	}

	// 3. Apply Student / PWD / Senior Citizen discount
	if passengerType != PassengerRegular {
		fare = fare * (1.0 - DiscountFactor)
	}

	// Round to nearest Centavo
	return math.Round(fare*100) / 100
}
