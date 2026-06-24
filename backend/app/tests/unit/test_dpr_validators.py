from datetime import date

import pytest

from app.domain.dpr.validators import DprValidationError, validate_report_date


def test_report_date_within_bounds_passes():
    validate_report_date(date(2026, 1, 15), date(2026, 1, 1), date(2026, 1, 20))


def test_report_date_before_project_start_raises():
    with pytest.raises(DprValidationError):
        validate_report_date(date(2025, 12, 31), date(2026, 1, 1), date(2026, 1, 20))


def test_report_date_in_future_raises():
    with pytest.raises(DprValidationError):
        validate_report_date(date(2026, 1, 21), date(2026, 1, 1), date(2026, 1, 20))
