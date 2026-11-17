import productConfig from '../../../product-config.json';

export interface TankerRecommendation {
  requiredVolumeLtr: number;
  tankerLabel: string;
  ullageCapped?: boolean;
}

export function parseTankCapacityLitres(tankCap?: string | number | null): number | null {
  if (tankCap === null || tankCap === undefined) return null;
  if (typeof tankCap === 'number' && Number.isFinite(tankCap) && tankCap > 0) {
    return tankCap <= 100 ? tankCap * 1000 : tankCap;
  }
  const raw = String(tankCap).trim().toUpperCase();
  if (!raw) return null;
  const klMatch = raw.match(/^(\d+(?:\.\d+)?)\s*KL$/i);
  if (klMatch) return Number(klMatch[1]) * 1000;
  const ltrMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:L|LTR|LITRES?)?$/i);
  if (ltrMatch) {
    const num = Number(ltrMatch[1]);
    return num > 0 ? (num <= 100 ? num * 1000 : num) : null;
  }
  return null;
}

export function recommendTanker(
  dailyBurnLtr: number,
  stockLtr: number,
  coverDays = productConfig.analytics.targetCoverDays,
  tankCap?: string | number | null,
): TankerRecommendation {
  const safeStock = Math.max(0, stockLtr);
  const demandDeficitLtr = Math.max(0, dailyBurnLtr * coverDays - safeStock);
  const capacityLtr = parseTankCapacityLitres(tankCap);
  const maxUllageLtr = capacityLtr !== null ? Math.max(0, capacityLtr - safeStock) : null;
  const requiredVolumeLtr = maxUllageLtr !== null
    ? Math.min(demandDeficitLtr, maxUllageLtr)
    : demandDeficitLtr;

  if (requiredVolumeLtr === 0) {
    return { requiredVolumeLtr: 0, tankerLabel: `No refill needed for ${coverDays}-day target` };
  }

  const fleetKl = [...productConfig.analytics.tankerFleetCapacitiesKl].sort((a, b) => a - b);
  for (const sizeKl of fleetKl) {
    if (requiredVolumeLtr <= sizeKl * 1000) {
      return { requiredVolumeLtr, tankerLabel: `${sizeKl} KL tanker` };
    }
  }

  const largestKl = fleetKl[fleetKl.length - 1] || 20;
  const tankerCount = Math.ceil(requiredVolumeLtr / (largestKl * 1000));
  return {
    requiredVolumeLtr,
    tankerLabel: `${largestKl} KL tanker${tankerCount > 1 ? ` × ${tankerCount}` : ''}`,
  };
}
