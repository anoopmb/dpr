from decimal import Decimal

from app.domain.attendance.validators import GeoPoint, haversine_distance_meters, is_within_geofence


def test_same_point_distance_is_zero():
    point = GeoPoint(latitude=Decimal("12.9716"), longitude=Decimal("77.5946"))
    assert haversine_distance_meters(point, point) == 0


def test_within_geofence_for_nearby_point():
    site = GeoPoint(latitude=Decimal("12.9716"), longitude=Decimal("77.5946"))
    # ~11m north
    check_in = GeoPoint(latitude=Decimal("12.97170"), longitude=Decimal("77.5946"))
    assert is_within_geofence(check_in, site, radius_meters=500) is True


def test_outside_geofence_for_far_point():
    site = GeoPoint(latitude=Decimal("12.9716"), longitude=Decimal("77.5946"))
    # roughly 1.2km away
    check_in = GeoPoint(latitude=Decimal("12.9826"), longitude=Decimal("77.5946"))
    assert is_within_geofence(check_in, site, radius_meters=500) is False
