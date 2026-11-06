export interface TankerRecommendation {
  requiredVolumeLtr: number;
  tankerLabel: string;
}

export function recommendTanker(dailyBurnLtr: number, stockLtr: number, coverDays = 3): TankerRecommendation {
  const requiredVolumeLtr = Math.max(0, dailyBurnLtr * coverDays - stockLtr);

  if (requiredVolumeLtr === 0) {
    return { requiredVolumeLtr, tankerLabel: 'No refill needed for 3-day target' };
  }
  if (requiredVolumeLtr <= 7500) {
    return { requiredVolumeLtr, tankerLabel: '7.5 KL tanker' };
  }
  if (requiredVolumeLtr <= 10000) {
    return { requiredVolumeLtr, tankerLabel: '10 KL tanker' };
  }

  const tankerCount = Math.ceil(requiredVolumeLtr / 20000);
  return {
    requiredVolumeLtr,
    tankerLabel: `20 KL tanker${tankerCount > 1 ? ` × ${tankerCount}` : ''}`,
  };
}
