import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptForHookStep } from "../src/promptBuilder.ts";

const packagePayload = {
  lead: {
    name: "Torrevieja Sur",
    slug: "torrevieja-sur",
    sector: "Inmobiliaria",
    zone: "Torrevieja",
    primaryColor: "#111827",
    accentColor: "#d4af37",
  },
  contact: {
    phone: "+34 600 000 000",
    whatsapp: "+34 600 000 000",
    email: "hola@example.com",
  },
  auditRun: {
    score: 80,
    analysis: {
      opportunities: ["Tour 360"],
      weaknesses: ["Web plana"],
    },
  },
};

test("G3 step 2 imports step 1 data without embedding the full generated file", () => {
  const step1Content = [
    "export const torreviejaSur = {",
    '  sentinel: "DO_NOT_EMBED_FULL_STEP_1_CONTENT",',
    '  veryLargeField: "' + "x".repeat(5000) + '"',
    "};",
  ].join("\n");

  const prompt = buildPromptForHookStep("G3", 2, packagePayload, [
    { path: "src/data/clientDemos/torreviejaSur.ts", content: step1Content },
  ]);

  assert.match(prompt, /import \{ torreviejaSur \} from "\.\/data\/clientDemos\/torreviejaSur";/);
  assert.doesNotMatch(prompt, /DO_NOT_EMBED_FULL_STEP_1_CONTENT/);
  assert.ok(prompt.length < step1Content.length);
});

test("G3 prompt reads contact data from leadIntelligenceProfile", () => {
  const payload = {
    lead: {
      name: "Torrevieja Sur",
      slug: "torrevieja-sur",
      sector: "Inmobiliaria",
      zone: "Torrevieja",
    },
    leadIntelligenceProfile: {
      contact: {
        phone: "+34 679 48 16 79",
        whatsapp: "+34 679 48 16 79",
        email: "info@torreviejasur.com",
        website: "https://torreviejasur.com/",
        address: "Torrevieja, Alicante",
      },
    },
  };

  const prompt = buildPromptForHookStep("G3", 2, payload, [
    { path: "src/data/clientDemos/torreviejaSur.ts", content: "export const torreviejaSur = {} as const;" },
  ]);

  assert.match(prompt, /torreviejasur\.com/);
  assert.match(prompt, /\+34 679 48 16 79/);
  assert.match(prompt, /info@torreviejasur\.com/);
});
