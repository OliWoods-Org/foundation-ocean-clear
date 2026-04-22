/**
 * Debris Detector — Satellite image analysis for ocean plastic detection.
 * @module debris-detector
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const SatelliteImageSchema = z.object({
  id: z.string().uuid(), source: z.enum(['sentinel-2', 'planetscope', 'landsat', 'custom']),
  capturedAt: z.string().datetime(), bounds: z.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() }),
  resolutionMeters: z.number().positive(), cloudCoverPercent: z.number().min(0).max(100),
  bands: z.array(z.string()),
});

export const DebrisDetectionSchema = z.object({
  id: z.string().uuid(), imageId: z.string().uuid(), detectedAt: z.string().datetime(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  areaSquareKm: z.number().positive(), confidence: z.number().min(0).max(1),
  debrisType: z.enum(['plastic-aggregation', 'sargassum', 'foam', 'mixed-debris', 'unknown']),
  estimatedMassTons: z.number().nonnegative().optional(),
  spectralSignature: z.object({ ndvi: z.number(), fdi: z.number(), pi: z.number() }),
});

export const CleanupTargetSchema = z.object({
  id: z.string().uuid(), detectionIds: z.array(z.string()), priority: z.enum(['critical', 'high', 'medium', 'low']),
  location: z.object({ lat: z.number(), lng: z.number() }), estimatedMassTons: z.number(),
  nearestPort: z.string(), distanceFromPortKm: z.number(),
  currentDirection: z.object({ bearing: z.number(), speedKmh: z.number() }),
  predictedLocation24h: z.object({ lat: z.number(), lng: z.number() }),
  ecologicalRisk: z.string(),
});

export type SatelliteImage = z.infer<typeof SatelliteImageSchema>;
export type DebrisDetection = z.infer<typeof DebrisDetectionSchema>;
export type CleanupTarget = z.infer<typeof CleanupTargetSchema>;

export function analyzeSpectralSignature(ndvi: number, fdi: number, pi: number): {
  isDebris: boolean; confidence: number; debrisType: string;
} {
  // Floating Debris Index (FDI) and Plastic Index (PI) thresholds based on ADOPT project research
  const isDebris = fdi > 0.02 && pi > 0.01 && ndvi < 0.1;
  const isSargassum = ndvi > 0.2 && fdi > 0.02;
  let confidence = 0;
  if (isDebris) { confidence = Math.min(0.95, 0.5 + fdi * 5 + pi * 10); }
  return {
    isDebris: isDebris && !isSargassum,
    confidence: Math.round(confidence * 1000) / 1000,
    debrisType: isSargassum ? 'sargassum' : isDebris ? (pi > 0.05 ? 'plastic-aggregation' : 'mixed-debris') : 'unknown',
  };
}

export function prioritizeCleanupTargets(detections: DebrisDetection[]): CleanupTarget[] {
  return detections
    .filter(d => d.confidence > 0.5 && d.debrisType !== 'sargassum')
    .map(d => {
      const mass = d.estimatedMassTons || d.areaSquareKm * 50; // rough estimate
      const priority: CleanupTarget['priority'] = mass > 100 ? 'critical' : mass > 50 ? 'high' : mass > 10 ? 'medium' : 'low';
      return CleanupTargetSchema.parse({
        id: crypto.randomUUID(), detectionIds: [d.id], priority,
        location: d.location, estimatedMassTons: Math.round(mass * 10) / 10,
        nearestPort: 'TBD', distanceFromPortKm: 0,
        currentDirection: { bearing: 0, speedKmh: 0 },
        predictedLocation24h: { lat: d.location.lat + 0.01, lng: d.location.lng + 0.02 },
        ecologicalRisk: mass > 50 ? 'HIGH: Large aggregation threatens marine ecosystems, seabird colonies, and fishing grounds'
          : 'MODERATE: Debris accumulation requires monitoring and collection planning',
      });
    })
    .sort((a, b) => { const p = { critical: 0, high: 1, medium: 2, low: 3 }; return p[a.priority] - p[b.priority]; });
}

export function estimateOceanPlasticMetrics(detections: DebrisDetection[]): {
  totalAreaKm2: number; estimatedTotalTons: number; hotspotCount: number; detectionsByType: Record<string, number>;
} {
  const totalArea = detections.reduce((s, d) => s + d.areaSquareKm, 0);
  const totalTons = detections.reduce((s, d) => s + (d.estimatedMassTons || d.areaSquareKm * 50), 0);
  const byType: Record<string, number> = {};
  for (const d of detections) byType[d.debrisType] = (byType[d.debrisType] || 0) + 1;
  return {
    totalAreaKm2: Math.round(totalArea * 100) / 100,
    estimatedTotalTons: Math.round(totalTons),
    hotspotCount: detections.filter(d => (d.estimatedMassTons || 0) > 50).length,
    detectionsByType: byType,
  };
}
