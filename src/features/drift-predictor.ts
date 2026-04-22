/**
 * Drift Predictor — Predict debris movement using ocean current and wind models.
 * @module drift-predictor
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const OceanCurrentSchema = z.object({
  lat: z.number(), lng: z.number(), timestamp: z.string().datetime(),
  uVelocity: z.number(), // east-west m/s
  vVelocity: z.number(), // north-south m/s
  source: z.enum(['copernicus', 'hycom', 'oscar', 'modeled']),
});

export const DriftPredictionSchema = z.object({
  debrisId: z.string(), startLocation: z.object({ lat: z.number(), lng: z.number() }),
  predictions: z.array(z.object({
    hoursAhead: z.number(), lat: z.number(), lng: z.number(),
    uncertainty_km: z.number(), currentSpeed_kmh: z.number(),
  })),
  likelyDestination: z.string(), timeToShoreHours: z.number().optional(),
  interceptPoints: z.array(z.object({ lat: z.number(), lng: z.number(), optimalInterceptTime: z.string() })),
});

export const RiverSourceSchema = z.object({
  riverName: z.string(), country: z.string(), mouthLocation: z.object({ lat: z.number(), lng: z.number() }),
  estimatedPlasticTonsPerYear: z.number(), rank: z.number().int(),
  primarySources: z.array(z.string()),
});

export type OceanCurrent = z.infer<typeof OceanCurrentSchema>;
export type DriftPrediction = z.infer<typeof DriftPredictionSchema>;
export type RiverSource = z.infer<typeof RiverSourceSchema>;

// Top polluting rivers
const TOP_RIVER_SOURCES: RiverSource[] = [
  { riverName: 'Pasig', country: 'Philippines', mouthLocation: { lat: 14.58, lng: 120.97 }, estimatedPlasticTonsPerYear: 63700, rank: 1, primarySources: ['Urban waste', 'Industrial discharge'] },
  { riverName: 'Klang', country: 'Malaysia', mouthLocation: { lat: 3.0, lng: 101.4 }, estimatedPlasticTonsPerYear: 35200, rank: 2, primarySources: ['Municipal waste', 'Manufacturing'] },
  { riverName: 'Yangtze', country: 'China', mouthLocation: { lat: 31.4, lng: 121.9 }, estimatedPlasticTonsPerYear: 33300, rank: 3, primarySources: ['Agriculture', 'Urban waste', 'Industry'] },
];

export function predictDrift(
  startLat: number, startLng: number, currents: OceanCurrent[], hoursToPredict: number = 72,
): DriftPrediction {
  const predictions: DriftPrediction['predictions'] = [];
  let lat = startLat, lng = startLng;
  for (let h = 6; h <= hoursToPredict; h += 6) {
    // Find nearest current data
    const nearest = currents.reduce((best, c) => {
      const dist = Math.sqrt((c.lat - lat) ** 2 + (c.lng - lng) ** 2);
      const bestDist = Math.sqrt((best.lat - lat) ** 2 + (best.lng - lng) ** 2);
      return dist < bestDist ? c : best;
    }, currents[0]);
    if (nearest) {
      // Simple Euler integration (production would use RK4)
      const dt = 6 * 3600; // 6 hours in seconds
      const windFactor = 0.03; // 3% wind drag on floating debris
      lat += (nearest.vVelocity + nearest.vVelocity * windFactor) * dt / 111000; // degrees
      lng += (nearest.uVelocity + nearest.uVelocity * windFactor) * dt / (111000 * Math.cos(lat * Math.PI / 180));
    }
    const speed = nearest ? Math.sqrt(nearest.uVelocity ** 2 + nearest.vVelocity ** 2) * 3.6 : 0;
    predictions.push({
      hoursAhead: h, lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000,
      uncertainty_km: Math.round(h * 0.5), currentSpeed_kmh: Math.round(speed * 100) / 100,
    });
  }
  return DriftPredictionSchema.parse({
    debrisId: crypto.randomUUID(),
    startLocation: { lat: startLat, lng: startLng },
    predictions,
    likelyDestination: 'Ocean gyre accumulation zone',
    interceptPoints: predictions.filter((_, i) => i % 4 === 0).map(p => ({
      lat: p.lat, lng: p.lng, optimalInterceptTime: `${p.hoursAhead} hours from now`,
    })),
  });
}

export function identifyUpstreamSources(debrisLat: number, debrisLng: number, radiusKm: number = 500): RiverSource[] {
  return TOP_RIVER_SOURCES.filter(r => {
    const dist = haversineKm(debrisLat, debrisLng, r.mouthLocation.lat, r.mouthLocation.lng);
    return dist <= radiusKm;
  }).sort((a, b) => a.rank - b.rank);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
