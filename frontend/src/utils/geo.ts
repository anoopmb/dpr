/**
 * Builds a Google Maps link for a coordinate pair, suitable for opening in a
 * new tab. Returns null when either coordinate is missing so callers can hide
 * the link. Accepts numbers or the string decimals the API returns.
 */
export function mapsLink(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): string | null {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
  return `https://www.google.com/maps?q=${latNum},${lngNum}`;
}
