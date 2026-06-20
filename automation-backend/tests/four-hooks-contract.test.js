import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const CONTRACT_DOCS = [
  "docs/09-four-hooks-engine-map.md",
  "docs/10-four-hooks-engine-contract.md",
  "docs/11-four-hooks-case-mapping.md",
  "docs/12-four-hooks-qa-gates.md",
];

const REQUIRED_TERMS = [
  "LeadEnrichmentData",
  "BrandSnapshot",
  "CommercialDiagnosis",
  "HookStrategy",
  "FourHookPackage",
  "LandingSpec",
  "VisualExperienceSpec",
  "FullWebsiteSpec",
  "BannerPackSpec",
];

const FORBIDDEN_PUBLIC_COPY = [
  "url_pendiente_confirmar",
  "experiencia_visual_premium",
  "Internal draft",
  "Rubik Internal Engine",
  "pending",
  "pendiente de confirmar",
  "lorem",
  "generated",
  "GITHUB_SERVER_TOKEN",
  "ghp_",
  "github_pat_",
  "Â",
  "Ã",
  "�",
];

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function validatePublicHookSpecCopy(spec) {
  const text = collectStrings(spec).join("\n");
  return FORBIDDEN_PUBLIC_COPY.filter((item) => text.includes(item));
}

test("four-hooks engine contract docs exist and define required terms", async () => {
  const repoRoot = path.resolve("..");
  const contents = await Promise.all(
    CONTRACT_DOCS.map((docPath) => fs.readFile(path.resolve(repoRoot, docPath), "utf8")),
  );
  const joined = contents.join("\n");
  for (const term of REQUIRED_TERMS) {
    assert.match(joined, new RegExp(`\\b${term}\\b`));
  }
  assert.match(joined, /motor existente: partial|Existing engine: partial/i);
  assert.match(joined, /QA gates/i);
});

test("public hook specs reject forbidden generic strings", () => {
  const candidate = {
    landing: {
      headline: "Tu hogar en Torrevieja y la Costa Levantina",
      cta: "Revisar propuesta visual",
      body: "Landing comercial para Sandhouse Inmobiliaria en Torrevieja.",
    },
    visualExperience: {
      headline: "Convierte cada propiedad en una primera visita memorable.",
      cta: "Solicitar experiencia visual",
    },
    bannerPack: {
      claims: ["Tu hogar en Torrevieja", "Vivir la Costa Levantina empieza aqui"],
    },
  };
  assert.deepEqual(validatePublicHookSpecCopy(candidate), []);

  const unsafe = {
    landing: {
      headline: "url_pendiente_confirmar",
      body: "Internal draft for generated proposal",
      note: "Rubik Internal Engine",
    },
  };
  assert.deepEqual(validatePublicHookSpecCopy(unsafe), [
    "url_pendiente_confirmar",
    "Internal draft",
    "Rubik Internal Engine",
    "generated",
  ]);
});
