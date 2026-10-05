export function getCountryFlag(countryName?: string): string {
  if (!countryName) return '🌐';
  const c = countryName.toLowerCase().trim();
  if (c.includes('canada')) return '🇨🇦';
  if (c.includes('united states') || c.includes('usa') || c === 'us') return '🇺🇸';
  if (c.includes('india')) return '🇮🇳';
  if (c.includes('australia')) return '🇦🇺';
  if (c.includes('united kingdom') || c.includes('uk') || c.includes('britain') || c.includes('england')) return '🇬🇧';
  if (c.includes('germany') || c.includes('deutschland')) return '🇩🇪';
  if (c.includes('france')) return '🇫🇷';
  if (c.includes('italy')) return '🇮🇹';
  if (c.includes('spain')) return '🇪🇸';
  if (c.includes('brazil')) return '🇧🇷';
  if (c.includes('mexico')) return '🇲🇽';
  if (c.includes('japan')) return '🇯🇵';
  if (c.includes('china')) return '🇨🇳';
  if (c.includes('netherlands')) return '🇳🇱';
  if (c.includes('new zealand')) return '🇳🇿';
  return '📍';
}
