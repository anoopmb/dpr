"""Generate a VAPID key pair for Web Push Notifications.

Run once and add the output to your .env:
    python scripts/generate_vapid.py
"""

import base64

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pywebpush import Vapid

v = Vapid()
v.generate_keys()

priv_bytes = v.private_key.private_numbers().private_value.to_bytes(32, "big")
priv_b64 = base64.urlsafe_b64encode(priv_bytes).rstrip(b"=").decode()

pub_bytes = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
pub_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()

print("Add these to your backend .env file:")
print(f"VAPID_PUBLIC_KEY={pub_b64}")
print(f"VAPID_PRIVATE_KEY={priv_b64}")
print()
print("Add this to your frontend .env (or .env.local):")
print(f"VITE_VAPID_PUBLIC_KEY={pub_b64}")
