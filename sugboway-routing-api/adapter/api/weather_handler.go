package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
)

// WeatherHandler proxies weatherapi.com. Keeping the request server-side means
// the API key lives in a private env var (WEATHER_API_KEY) and is never shipped
// to the browser bundle (OWASP: no secrets client-side).
type WeatherHandler struct {
	apiKey string
	client *http.Client
}

// NewWeatherHandler reads WEATHER_API_KEY from the environment.
func NewWeatherHandler() *WeatherHandler {
	return &WeatherHandler{
		apiKey: os.Getenv("WEATHER_API_KEY"),
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

// cebuQuery is the fixed lookup point (central Cebu City); the endpoint takes no
// user input, so there's nothing to validate/inject.
const cebuQuery = "10.3157,123.8854"

// GetWeather returns the current Cebu weather as { text, temp_c, humidity }.
func (h *WeatherHandler) GetWeather(c *fiber.Ctx) error {
	if h.apiKey == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "weather_not_configured"})
	}

	endpoint := "https://api.weatherapi.com/v1/current.json?" + url.Values{
		"key": {h.apiKey},
		"q":   {cebuQuery},
	}.Encode()

	resp, err := h.client.Get(endpoint)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "weather_unavailable"})
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "weather_unavailable"})
	}

	var payload struct {
		Current struct {
			TempC     float64 `json:"temp_c"`
			Humidity  int     `json:"humidity"`
			Condition struct {
				Text string `json:"text"`
			} `json:"condition"`
		} `json:"current"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "weather_unavailable"})
	}

	return c.JSON(fiber.Map{
		"text":     payload.Current.Condition.Text,
		"temp_c":   payload.Current.TempC,
		"humidity": payload.Current.Humidity,
	})
}
