package domain

import (
	"math"
	"time"
)

// CalculateBPRCost computes the adjusted travel time using the Bureau of Public Roads (BPR) function:
// c_ij(f) = l_ij + alpha * (f / C_ij)^beta * l_ij
func CalculateBPRCost(distanceMeters float64, passengerVolume int, roadType string, roadCapacity int, departureTime time.Time) float64 {
	// 1. Determine free-flow travel time (l_ij) based on Road Baseline speeds
	var speedKph float64

	if roadType == "national" {
		speedKph = 40.0
	} else {
		// default to barangay/urban road
		speedKph = 20.0
	}

	speedMps := (speedKph * 1000.0) / 3600.0
	freeFlowTime := distanceMeters / speedMps

	if freeFlowTime <= 0 {
		return 0
	}

	// 2. Calibration Logic based on Peak Windows
	hour := departureTime.Hour()
	isPeak := (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20) // 7-9 AM and 5-8 PM

	var alpha, beta float64
	if isPeak {
		alpha = 0.15
		beta = 4.0
	} else {
		alpha = 0.10
		beta = 3.0
	}

	// 3. Flow rate (f) is seeded from the passenger volume
	f := float64(passengerVolume)
	capacity := float64(roadCapacity)
	if capacity <= 0 {
		capacity = 5000.0 // safe fallback
	}

	// Calculate BPR congestion factor
	flowRatio := f / capacity
	congestionFactor := alpha * math.Pow(flowRatio, beta)

	// c_ij(f) = l_ij + alpha * (f / C_ij)^beta * l_ij
	adjustedTime := freeFlowTime + (congestionFactor * freeFlowTime)

	return adjustedTime
}
