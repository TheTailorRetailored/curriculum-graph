import { Patch } from "../schema/zodSchemas.js";
import { canonicalJson, canonicalJsonHash } from "../util/canonicalJson.js";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export type StagedPatch = {
  validation_id: string;
  patch_digest: string;
  patch_id: string;
  canonical_json_sha256: string;
  canonical_json_size: number;
  operation_count: number;
  validated_at: string;
  expires_at: string;
  strictness: "loose" | "normal" | "strict";
  patch: Patch;
};

const stagedPatches = new Map<string, StagedPatch>();

function pruneExpired(now = Date.now()) {
  for (const [id, staged] of stagedPatches.entries()) {
    if (Date.parse(staged.expires_at) <= now) stagedPatches.delete(id);
  }
}

export function stageValidatedPatch(patch: Patch, strictness: "loose" | "normal" | "strict", ttlMs = DEFAULT_TTL_MS): Omit<StagedPatch, "patch"> {
  pruneExpired();
  const canonical = canonicalJson(patch);
  const canonical_json_sha256 = canonicalJsonHash(patch);
  const patch_digest = canonicalJsonHash({ patch_id: patch.patch_id, canonical_json_sha256 });
  const validation_id = `validation.${patch.patch_id}.${canonical_json_sha256.slice(0, 16)}`;
  const staged: StagedPatch = {
    validation_id,
    patch_digest,
    patch_id: patch.patch_id,
    canonical_json_sha256,
    canonical_json_size: canonical.length,
    operation_count: patch.operations.length,
    validated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    strictness,
    patch
  };
  stagedPatches.set(validation_id, staged);
  const { patch: _patch, ...summary } = staged;
  return summary;
}

export function getStagedPatch(validationId: string, patchDigest?: string): StagedPatch {
  pruneExpired();
  const staged = stagedPatches.get(validationId);
  if (!staged) throw new Error(`Validated patch not found or expired: ${validationId}`);
  if (patchDigest && patchDigest !== staged.patch_digest) {
    throw new Error(`Patch digest mismatch for ${validationId}`);
  }
  return staged;
}
