import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WorkerPaymentCreate(BaseModel):
    worker_id: uuid.UUID
    project_id: uuid.UUID
    payment_date: date
    payment_type: str = Field(max_length=20)
    amount: Decimal = Field(gt=0)
    remarks: str | None = Field(default=None, max_length=500)


class WorkerPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    worker_id: uuid.UUID
    project_id: uuid.UUID
    payment_date: date
    payment_type: str
    amount: Decimal
    remarks: str | None
    recorded_by: uuid.UUID


class WorkerLedgerEntry(BaseModel):
    """One line in the worker's chronological ledger (earning or payment)."""

    entry_type: str  # "EARNING" | "ADVANCE" | "PAYMENT" | "DEDUCTION"
    entry_date: date
    description: str
    amount: Decimal
    running_balance: Decimal


class WorkerLedgerRead(BaseModel):
    worker_id: uuid.UUID
    worker_name: str
    worker_type: str
    wage_unit: str | None
    project_id: uuid.UUID
    total_earned: Decimal
    total_paid: Decimal
    total_deducted: Decimal
    balance_pending: Decimal
    payments: list[WorkerPaymentRead]


class WorkerLedgerSummaryRow(BaseModel):
    worker_id: uuid.UUID
    worker_name: str
    worker_type: str
    wage_unit: str | None
    total_earned: Decimal
    total_paid: Decimal
    total_deducted: Decimal
    balance_pending: Decimal
