package domain

import (
	"math"
	"testing"
)

func TestCalculateLegFare(t *testing.T) {
	tests := []struct {
		name           string
		distanceMeters float64
		routeType      string
		routeID        string
		passengerType  PassengerType
		expectedFare   float64
	}{
		{
			name:           "Regular fare within 4km (Traditional)",
			distanceMeters: 3500.0,
			routeType:      "jeepney",
			routeID:        "17B",
			passengerType:  PassengerRegular,
			expectedFare:   13.00,
		},
		{
			name:           "Regular fare excess distance (Traditional)",
			distanceMeters: 6000.0, // 6km (2km excess)
			routeType:      "jeepney",
			routeID:        "17B",
			passengerType:  PassengerRegular,
			expectedFare:   13.00 + (2.0 * 2.00), // 13.00 + 4.00 = 17.00
		},
		{
			name:           "Student discount within 4km (Traditional)",
			distanceMeters: 3000.0,
			routeType:      "jeepney",
			routeID:        "17B",
			passengerType:  PassengerStudent,
			expectedFare:   math.Round(13.00*0.80*100) / 100, // 10.40
		},
		{
			name:           "PWD discount excess distance (Modern)",
			distanceMeters: 8000.0, // 8km (4km excess)
			routeType:      "modern_ejeep",
			routeID:        "13C",
			passengerType:  PassengerPWD,
			expectedFare:   math.Round((13.00+(4.0*2.50))*0.80*100) / 100, // (13.00 + 10.00) * 0.8 = 18.40
		},
		{
			name:           "Express MyBus SRP Flat Fee Override (Regular)",
			distanceMeters: 12000.0,
			routeType:      "mybus",
			routeID:        "mybus_srp",
			passengerType:  PassengerRegular,
			expectedFare:   25.00,
		},
		{
			name:           "Express MyBus SRP Flat Fee Override (Senior)",
			distanceMeters: 12000.0,
			routeType:      "mybus",
			routeID:        "mybus_srp",
			passengerType:  PassengerSenior,
			expectedFare:   math.Round(25.00*0.80*100) / 100, // 20.00
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateLegFare(tt.distanceMeters, tt.routeType, tt.routeID, tt.passengerType)
			if got != tt.expectedFare {
				t.Errorf("CalculateLegFare() = %v, expected %v", got, tt.expectedFare)
			}
		})
	}
}
