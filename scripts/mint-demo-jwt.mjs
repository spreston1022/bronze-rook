#!/usr/bin/env node
// Mints a demo RS256 JWT for exercising generic-jwt-auth-inbound and
// generic-cost-quota-inbound locally, without a real IDP.
//
// DEMO ONLY. The private key below matches the public key published by
// modules/demo-idp-jwks-handler.ts and exists purely so this repo is
// self-testable — never reuse it for anything real.
//
// Usage:
//   node scripts/mint-demo-jwt.mjs --sub=user-123 [--issuer=...] [--audience=...] [--ttl=3600]

import { createSign } from "node:crypto";

const PRIVATE_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA3rPbxTrlN08tVuF0zA1tXONTzPcEB9RN2H3BfqoY35+a52Vr
gP3vSfcI1gO15vKN7vjee3hp4RxpckjAlUomnAuBOhjuq0IMDOrjRsITMTVdyGoq
C1d9iZ0Cxad5AT4+Z/u2BOF0zLRlWB2GtxHz3wLnQmVTk84crvAn2cmH+vUV0pRm
/cZq2KyE0Fp01oLiBR7zBwFm4yiigHKXsoe4xLmr8/xHZibuhaFpaohe3D2kVx34
G4b6tIq/V6yJdUWass/KZy2j5kTAMCaBd/DPtU4G7pKUBiezsp8zaLpSxL4eQDP/
l6S8fDC8Hoh/ZO6ivZmDCSXfJztGGJcc18hOFwIDAQABAoIBAEgAtMyW1ydDxS/y
4vVaXgKLSTvanYX+gVC+kAHo8vPSQZ4Q72ocL/KlGUlAl95ci8E4243mB62NpxYZ
KZLbD5KiMZzcFMZwKz897k+hTd06GOFEWeWi2ubUSeIn3HqnajvqaRY44q+Qn7eW
jEjCWCvBX43a/uOp3yI8aVYDz6A2ZPCzqdWgAlD2ZGiU0+Do6dtlky6cOHP+iUN/
i/QCiLGrOk4nvhsHRC9f/3p8/o1e9s22pKowqwroSWPz3BMtG7MT6+7rUIN8HXRm
/Qta48+Ry55yzdnTUMYNz8txIicgzxQQROLhJ25EXTZZ2W9Qe4yuoS9AWZH7k0Tj
chViI5kCgYEA9D0EoUdOyOL8PA2uAqPp5fDIefjE86sghN5yEDAJe6/J3SXdJQw6
jyAXtR1iDQu6TZKdYAW4F2yBT7VAF7bOCLZ8t9d7QO3fwUAc9Uj2AtEouzXzZrib
Rq2e2zcvOBha6j2HGCAsQ7iZ2Ofq6u75fssdBJj5bsq6Hf1CBVjbOAMCgYEA6W1Y
piCq7rQKOnGjdrtBtYGZjkfvBHaEwoxUaEu+r6mdl4bNckZVlwZ5//OLuJ0WQDPq
K/3rJOofG2v+CoFOnVoxLt7p7udHeAO8vRL8sfevxkBRm8t/qQmDScn93IipimJl
FC3ttY3jd8kz2u58a9sR2ZiqRbuiZw8iHoeJp10CgYBh/3m0HKCICkua7QI9HPfk
w1AtYJvmCWvq5DZwOFYVwtsEWQT6sIVumDnq+fc1tNbz+TgcJy9OdsML8HXfDgJt
jItOWK+jxc5aBBeac8QCLVpig6s+NCRZn6B15RaVM3CHPFjQXVhlc9SHK8cerPR+
45CpH5g11DIJhmzPKHANcQKBgAMYXRWO11Vk88HEoftADmX+uu+FCqlPfQErZS8g
2f1wTVOmCPFb92SSRGnda9vd0V62kYNV0ZlitVjivLKc9lLl0EMj14xAatUvj4Ae
UVV2yFDjp3FeaGnwY1pGIGSdN0pLdbWnykAfCoYbF+HuSZ4QgJMXECLukv+01qn6
+BtNAoGBAMkW0/BW9iZBJigCLqL6+wa5ccVOu4+xBqd0UGwcdv36XFSn101IAY2n
D6pqzCW9iZlJaKP7m/kOuBEZE2h5mZ4w8yUcxbCNkiBvl8z/kelAUWlTaQGK0M2v
1GN5gXMmhpHqGpYLg9P0w8QkD4eFaFGkoRsuiTtPjw7XSRJ9tqPK
-----END RSA PRIVATE KEY-----`;

const KID = "demo-idp-key-1";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const issuer = args.issuer ?? process.env.JWT_ISSUER ?? "http://localhost:9000";
const audience = args.audience ?? process.env.JWT_AUDIENCE ?? "generic-ai-gateway";
const sub = args.sub ?? "demo-user-1";
const ttlSeconds = Number(args.ttl ?? 3600);

const now = Math.floor(Date.now() / 1000);
const header = { alg: "RS256", typ: "JWT", kid: KID };
const payload = { iss: issuer, aud: audience, sub, iat: now, exp: now + ttlSeconds };

const encodedHeader = base64url(JSON.stringify(header));
const encodedPayload = base64url(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;

const signer = createSign("RSA-SHA256");
signer.update(signingInput);
signer.end();
const encodedSignature = base64url(signer.sign(PRIVATE_KEY_PEM));

console.log(`${signingInput}.${encodedSignature}`);
