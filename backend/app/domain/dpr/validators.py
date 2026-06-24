"""DPR date-bounds validation: a report can't be backdated before the
project started, and can't be future-dated."""

from datetime import date

from app.core.exceptions import DomainError


class DprValidationError(DomainError):
    error_code = "DPR_DATE_OUT_OF_RANGE"


def validate_report_date(report_date: date, project_start_date: date, today: date) -> None:
    if report_date < project_start_date:
        raise DprValidationError(
            f"Report date {report_date} is before the project start date {project_start_date}."
        )
    if report_date > today:
        raise DprValidationError(f"Report date {report_date} cannot be in the future.")
