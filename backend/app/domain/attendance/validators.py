"""Geofence check for attendance check-ins.

Distance is computed server-side from the submitted GPS coordinates against
the project's registered site coordinates — never trust a client-supplied
"within range" flag. Outside-geofence check-ins are recorded, not blocked
(visibility for the PM to review beats silently losing an attendance entry).
"""

import math
from dataclasses import dataclass
from decimal import Decimal

EARTH_RADIUS_METERS = 6_371_000


@dataclass(frozen=True)
class GeoPoint:
    latitude: Decimal
    longitude: Decimal


def haversine_distance_meters(a: GeoPoint, b: GeoPoint) -> float:
    lat1, lon1, lat2, lon2 = (math.radians(float(v)) for v in (a.latitude, a.longitude, b.latitude, b.longitude))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(h))


def is_within_geofence(
    check_in_point: GeoPoint, site_point: GeoPoint, radius_meters: int
) -> bool:
    return haversine_distance_meters(check_in_point, site_point) <= radius_meters
