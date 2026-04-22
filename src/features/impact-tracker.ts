/**
 * Impact Tracker — Track cleanup operations and environmental impact metrics.
 * @module impact-tracker
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const CleanupOperationSchema = z.object({
  id: z.string().uuid(), name: z.string(), organization: z.string(),
  startDate: z.string().datetime(), endDate: z.string().datetime().optional(),
  location: z.object({ lat: z.number(), lng: z.number(), name: z.string() }),
  type: z.enum(['vessel-based', 'beach-cleanup', 'river-barrier', 'drone-collection', 'community']),
  plasticCollectedKg: z.number().nonnegative(), areaCleanedKm2: z.number().nonnegative(),
  volunteers: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional(),
  debrisTypes: z.record(z.string(), z.number()),
});

export const ImpactReportSchema = z.object({
  period: z.object({ start: z.string(), end: z.string() }),
  totalPlasticRemovedTons: z.number(), totalOperations: z.number(),
  totalAreaCleanedKm2: z.number(), totalVolunteers: z.number(),
  costPerTon: z.number(), topDebrisTypes: z.array(z.object({ type: z.string(), percentOfTotal: z.number() })),
  equivalencies: z.array(z.object({ metric: z.string(), value: z.string() })),
});

export type CleanupOperation = z.infer<typeof CleanupOperationSchema>;
export type ImpactReport = z.infer<typeof ImpactReportSchema>;

export function generateImpactReport(operations: CleanupOperation[]): ImpactReport {
  const totalKg = operations.reduce((s, o) => s + o.plasticCollectedKg, 0);
  const totalTons = totalKg / 1000;
  const totalArea = operations.reduce((s, o) => s + o.areaCleanedKm2, 0);
  const totalVols = operations.reduce((s, o) => s + (o.volunteers || 0), 0);
  const totalCost = operations.reduce((s, o) => s + (o.cost || 0), 0);
  const debrisTotals: Record<string, number> = {};
  for (const op of operations) { for (const [type, kg] of Object.entries(op.debrisTypes)) debrisTotals[type] = (debrisTotals[type] || 0) + kg; }
  const topTypes = Object.entries(debrisTotals).sort(([, a], [, b]) => b - a).slice(0, 5).map(([type, kg]) => ({
    type, percentOfTotal: totalKg > 0 ? Math.round((kg / totalKg) * 100) : 0,
  }));
  const dates = operations.map(o => o.startDate).sort();
  return ImpactReportSchema.parse({
    period: { start: dates[0] || '', end: dates[dates.length - 1] || '' },
    totalPlasticRemovedTons: Math.round(totalTons * 10) / 10,
    totalOperations: operations.length, totalAreaCleanedKm2: Math.round(totalArea * 10) / 10,
    totalVolunteers: totalVols, costPerTon: totalTons > 0 ? Math.round(totalCost / totalTons) : 0,
    topDebrisTypes: topTypes,
    equivalencies: [
      { metric: 'Plastic bottles prevented from ocean', value: `${Math.round(totalKg / 0.025).toLocaleString()} bottles` },
      { metric: 'Sea turtles protected', value: `~${Math.round(totalTons * 5)} (estimated)` },
      { metric: 'Microplastic particles prevented', value: `${Math.round(totalKg * 1000).toLocaleString()} potential particles` },
    ],
  });
}
