import { createPublicKey, verify } from "node:crypto";

export function verifyGoogleToken(jwt, keys, audience, nonce) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw Error("Invalid token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const p = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw Error("Invalid algorithm");
  const key = keys.find(
    (k) =>
      k.kid === header.kid && k.kty === "RSA" && (!k.use || k.use === "sig"),
  );
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    )
  )
    throw Error("Invalid signature");
  const now = Date.now() / 1000;
  if (
    !["https://accounts.google.com", "accounts.google.com"].includes(p.iss) ||
    p.aud !== audience ||
    (p.azp && p.azp !== audience) ||
    typeof p.exp !== "number" ||
    p.exp <= now ||
    typeof p.iat !== "number" ||
    p.iat > now + 60 ||
    p.nonce !== nonce ||
    typeof p.sub !== "string" ||
    !p.sub ||
    typeof p.email !== "string" ||
    p.email_verified !== true
  )
    throw Error("Invalid claims");
  return p;
}

