export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

function requestPosition(options: PositionOptions): Promise<CapturedPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => reject(error),
      options,
    );
  });
}

export async function getCurrentPosition(): Promise<CapturedPosition> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device.');
  }
  try {
    // GPS-only high-accuracy lookups routinely time out on Android (cold GPS
    // chip, indoors, etc.) even though iOS resolves the same request quickly
    // via WiFi-assisted positioning. Fall back to a network-based fix instead
    // of failing outright.
    return await requestPosition({ enableHighAccuracy: true, timeout: 20_000 });
  } catch (error) {
    // A real permission denial can't be retried into success — surface it
    // immediately instead of masking it behind a second, doomed attempt.
    if (error instanceof GeolocationPositionError && error.code === error.PERMISSION_DENIED) {
      throw error;
    }
    return await requestPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  }
}

export function describeLocationError(error: unknown): string {
  if (error instanceof GeolocationPositionError) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission is blocked for this site. Enable it in your browser/app site settings, then tap Refresh.';
      case error.POSITION_UNAVAILABLE:
        return 'Could not determine your location. Make sure Location/GPS is turned on for this device, then tap Refresh.';
      case error.TIMEOUT:
        return 'Location request timed out. Move to an area with better GPS/network signal, then tap Refresh.';
      default:
        return 'Could not get GPS location. Try again.';
    }
  }
  return 'Could not get GPS location. Try again.';
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { 'Accept-Language': 'en' } },
    );
    if (!res.ok) throw new Error('Geocode failed');
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}

export function haversineDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
