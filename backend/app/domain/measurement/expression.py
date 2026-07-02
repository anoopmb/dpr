"""Safe arithmetic-expression evaluator for dimension inputs (e.g. a site
engineer entering "(1+2.5)/2" instead of a single reading). Deliberately NOT
eval()-based — a hand-written tokenizer + recursive-descent parser that only
understands +, -, *, /, parentheses, and decimal numbers. Used server-side
to re-derive the trusted Decimal from whatever expression text the client
submitted; the client's own computed value is never trusted (same principle
as domain/measurement/calculators.py)."""

import re
from decimal import Decimal, DivisionByZero, InvalidOperation

from app.core.exceptions import DomainError

_TOKEN_RE = re.compile(r"\s*(?:(\d+\.?\d*)|(.))")


class ExpressionError(DomainError):
    error_code = "INVALID_DIMENSION_EXPRESSION"


class _Tokenizer:
    def __init__(self, text: str) -> None:
        self.tokens: list[str] = []
        pos = 0
        while pos < len(text):
            match = _TOKEN_RE.match(text, pos)
            if match is None or match.end() == pos:
                raise ExpressionError(f"Could not parse expression: {text!r}")
            number, other = match.groups()
            if number:
                self.tokens.append(number)
            elif other and not other.isspace():
                if other not in "+-*/()":
                    raise ExpressionError(f"Unsupported character {other!r} in expression: {text!r}")
                self.tokens.append(other)
            pos = match.end()
        self.pos = 0

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def next(self) -> str:
        tok = self.peek()
        if tok is None:
            raise ExpressionError("Unexpected end of expression")
        self.pos += 1
        return tok


def evaluate_expression(text: str) -> Decimal:
    """Evaluates a basic arithmetic expression (+, -, *, /, parentheses,
    unary minus) and returns the result as a Decimal. Raises ExpressionError
    on any syntax issue, division by zero, or malformed number."""
    tokenizer = _Tokenizer(text)
    if tokenizer.peek() is None:
        raise ExpressionError("Expression is empty")

    def parse_expression() -> Decimal:
        value = parse_term()
        while tokenizer.peek() in ("+", "-"):
            op = tokenizer.next()
            rhs = parse_term()
            value = value + rhs if op == "+" else value - rhs
        return value

    def parse_term() -> Decimal:
        value = parse_factor()
        while tokenizer.peek() in ("*", "/"):
            op = tokenizer.next()
            rhs = parse_factor()
            if op == "*":
                value = value * rhs
            else:
                try:
                    value = value / rhs
                except (DivisionByZero, ZeroDivisionError) as exc:
                    raise ExpressionError(f"Division by zero in expression: {text!r}") from exc
        return value

    def parse_factor() -> Decimal:
        tok = tokenizer.peek()
        if tok == "-":
            tokenizer.next()
            return -parse_factor()
        if tok == "+":
            tokenizer.next()
            return parse_factor()
        if tok == "(":
            tokenizer.next()
            value = parse_expression()
            if tokenizer.peek() != ")":
                raise ExpressionError(f"Missing closing parenthesis in expression: {text!r}")
            tokenizer.next()
            return value
        if tok is not None and re.fullmatch(r"\d+\.?\d*", tok):
            tokenizer.next()
            try:
                return Decimal(tok)
            except InvalidOperation as exc:
                raise ExpressionError(f"Invalid number {tok!r} in expression: {text!r}") from exc
        raise ExpressionError(f"Unexpected token {tok!r} in expression: {text!r}")

    result = parse_expression()
    if tokenizer.peek() is not None:
        raise ExpressionError(f"Unexpected trailing input in expression: {text!r}")
    return result
