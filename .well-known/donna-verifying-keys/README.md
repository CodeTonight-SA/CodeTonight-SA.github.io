# GRIP / DONNA verifying keys — `grip-production`

**STATUS: PUBLISHED 2026-09-13** at
`https://codetonight.co.za/.well-known/donna-verifying-keys/`, on the operator's
explicit instruction.

Publishing a verifying key is an effectively irreversible public commitment —
once it has been indexed and fetched, it cannot be recalled — so it was gated on
that instruction, and on the two verification traps described below being found,
fixed and proved first. Both were: an anchor mismatch used to exit 1 (BROKEN,
"tampered or signed by another key") on a genuine record, and the persisted line
carried a `decision_anatomy` key the signer never signed. Publishing keys while
the documented verification path reported honest records as forgeries would have
been worse than publishing nothing.

These are **public verifying keys only**. The private halves live at
`state/audit/keys/grip-production/` in mode 0600 and are never copied here — this
directory is produced by `lib/aide/key_provisioning.publish_verifying_key_manifest`,
which reads only `verifying*.pub`.

| File | Limb | Fingerprint |
|---|---|---|
| `grip-production.pub` | Ed25519 (classical) | `c5b55c42` |
| `grip-production-mldsa65.pub` | ML-DSA-65 / FIPS 204 (post-quantum) | `ad0de15d` |

Both limbs are required. `lib/pq_dual_sign.dual_verify_external` is an AND, not an
OR: a record is VERIFIED only if both signatures check against both keys and both
declared fingerprints bind. A missing or non-binding limb is BROKEN, never a silent
pass. Publishing only the classical key would leave every dual record unverifiable
by the third party the dual signature exists to convince.

## What you can check with these keys

For a record whose `audit.scheme` is `ed25519+ml-dsa-65`, you can establish,
without trusting GRIP and without holding any secret:

- the record's body has not been altered by one bit since it was signed;
- it was signed by the holder of these two private keys;
- substituting a different key fails closed rather than verifying.

## What you cannot check with these keys

- **Almost every record.** At the time of writing exactly **1** of 910 decision
  records carries this scheme. The other 909, and all 20,283 belief-chain records,
  are HMAC-SHA256 under a single shared secret on the operator's machine — anyone
  holding that key can forge them, and nobody without it can check them. These
  keys do nothing for those records, and no amount of publishing will: the records
  cannot be re-signed without asserting a custody they never had.
- **That the content is true.** A signature binds bytes to a key. It says nothing
  about whether the decision recorded was sound, or whether what the record asserts
  about the world is accurate.
- **When it was signed.** The signature carries no trusted time. Timing comes from
  the separate OpenTimestamps anchors in `state/anchors/`, which prove the anchored
  bytes existed by a given Bitcoin block — existence, not honesty.

## Verifying a record

**Use the shipped command.** It handles the body reconstruction for you, and the
two traps described below are exactly why hand-rolling it is a bad idea.

```bash
grip-idr-verify-external idr.jsonl \
    --ed25519-key grip-production.pub \
    --mldsa65-key grip-production-mldsa65.pub \
    --anchor 'human:vbar-2026-09-11-key-compromised-freeze-and-reseal'
```

Exit codes are three-valued on purpose: `0` VERIFIED, `1` BROKEN, `3` DEGRADED
(could not be checked — an HMAC record lands here and is never a pass), `2` usage.

**`--anchor` is not optional for this ledger, and getting it wrong used to look
like forgery.** A ledger is assembled into a forest rooted at an anchor you
supply, and every record's `predecessor_idr` must chain to it. The one
dual-signed record in this chain has the predecessor shown above, which is not
the tool's default. Until 2026-09-13 supplying the wrong one raised an uncaught
`IdrForestError`, Python exited 1, and 1 is this tool's code for BROKEN —
"tampered, or signed by another key". An auditor running the published command
against a genuine record with the correct keys was shown a traceback and a
status meaning forgery. That now exits 2 with a message naming the flag. If you
are reading an older copy of this tool, an exit of 1 with a traceback is an
anchor mismatch, not a tamper.

### Doing it by hand

```python
import json
from pathlib import Path
from lib.audit_chain import compute_entry_hash
from lib.pq_dual_sign import dual_verify_external, public_key_raw_from_pem

record = json.loads(line)                      # one line of state/precog/idr.jsonl
kd = Path(".well-known/donna-verifying-keys")
ed = public_key_raw_from_pem((kd / "grip-production.pub").read_bytes())
pq = public_key_raw_from_pem((kd / "grip-production-mldsa65.pub").read_bytes())

# Reconstruct the SIGNED body: drop `audit`, and drop `decision_anatomy` when null.
body = {k: v for k, v in record.items()
        if k != "audit" and not (k == "decision_anatomy" and v is None)}

print(dual_verify_external(compute_entry_hash(body).encode(), record["audit"], ed, pq))
```

**The `decision_anatomy` step is the second trap.** When a record carries no
decision anatomy, `build_idr` never adds the key to the envelope it signs. Every
record written before 2026-09-13 nevertheless has `"decision_anatomy": null` in
its persisted line, because the writer serialised the whole dataclass. A verifier
feeding such a line back verbatim hashes a body the signer never signed and gets
**BROKEN on a perfectly genuine record** — including the one dual-signed record
above, which predates the fix. Drop the key when its value is null; keep it when
it is populated, because then it is signed content.

From 2026-09-13 the writer omits the null, so the stored line and the signed body
are identical and verbatim reconstruction works. The drop step is harmless either
way — on a newer record the key is simply absent — so the recipe above is correct
for both eras, and you should keep it.

Note also that `compute_entry_hash` returns a hex *string* and
`dual_verify_external` takes *bytes* — pass `.encode()`. Passing the string returns
BROKEN, which looks identical to a tamper.

## Reproduced results

Against `precog-1789160146-90c76e98` (`kind: custody-genesis`, 2026-09-11), the one
dual-signed record in the live chain:

| Input | Verdict |
|---|---|
| genuine record, body reconstructed as above | `VERIFIED` |
| `depth` incremented by one | `BROKEN` |
| `ts` replaced | `BROKEN` |
| `kind` replaced | `BROKEN` |
| verified against a different tenant's Ed25519 key | `BROKEN` |
| genuine record, `decision_anatomy: null` left in the body | `BROKEN` |

The negative rows matter as much as the positive one: a check that cannot fail
proves nothing, so each tamper was run and observed to fail before the passing
result was reported.
