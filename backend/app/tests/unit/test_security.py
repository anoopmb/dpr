from app.core.security import generate_csrf_token, hash_password, verify_password


def test_hash_password_roundtrip():
    hashed = hash_password("correct-password")
    assert verify_password("correct-password", hashed)


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct-password")
    assert not verify_password("wrong-password", hashed)


def test_generate_csrf_token_is_unique_and_nonempty():
    token_a = generate_csrf_token()
    token_b = generate_csrf_token()
    assert token_a and token_b
    assert token_a != token_b
