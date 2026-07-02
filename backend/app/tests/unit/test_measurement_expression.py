from decimal import Decimal

import pytest

from app.domain.measurement.expression import ExpressionError, evaluate_expression


@pytest.mark.parametrize(
    "expression,expected",
    [
        ("(1+2.5)/2", Decimal("1.75")),
        ("5", Decimal("5")),
        ("2+3*4", Decimal("14")),
        ("(2+3)*4", Decimal("20")),
        ("-5+2", Decimal("-3")),
        ("10/4", Decimal("2.5")),
        ("1.5+2.5+3.5", Decimal("7.5")),
        ("  ( 1 + 2 )  ", Decimal("3")),
    ],
)
def test_evaluate_expression_valid(expression, expected):
    assert evaluate_expression(expression) == expected


@pytest.mark.parametrize("expression", ["1/0", "1+", "(1+2", "abc", "1+2)", ""])
def test_evaluate_expression_invalid(expression):
    with pytest.raises(ExpressionError):
        evaluate_expression(expression)
