// Zod mirror of icmp_detector/schema/bundle.schema.json. Bundles that fail this never reach the views.
import { z } from "zod";

const source = z.enum(["simulated", "capture"]);
const rate = z.number().min(0).max(1).nullable();
const delayModel = z.enum(["folded", "netem"]).nullable();
const interval = z.object({ estimate: rate, lo: rate, hi: rate, runs: z.number().int() });
const ci = z.object({ detection_rate: interval, false_positive_rate: interval }).nullable();
const bitString = z.string().regex(/^[01?]*$/);
const seedStat = z.object({
  mean: z.number().nullable(), std: z.number().nullable(), min: z.number().nullable(), max: z.number().nullable(),
  lo: z.number().nullable(), hi: z.number().nullable(), seeds: z.number().int(),
});

export const runSchema = z.object({
  id: z.string(),
  label: z.enum(["normal", "covert"]),
  source,
  role: z.enum(["baseline-clean", "baseline-matched", "test"]),
  times: z.array(z.number()).min(2),
  seq: z.array(z.number().int()).nullable(),
  condition: z.string(),
  delayModel,
  channel: z.string().nullable(),
  seed: z.number().int().nullable(),
  bits: bitString.nullable(),
  gap0: z.number().optional(),
  gap1: z.number().optional(),
  file: z.string().optional(),
});

export const bundleSchema = z.object({
  schemaVersion: z.string().regex(/^1\.\d+\.\d+$/),
  generatedAt: z.string(),
  provenance: z.object({
    simulated: z.boolean(),
    hasSimulated: z.boolean(),
    hasCapture: z.boolean(),
    commit: z.string().nullable(),
    seed: z.number().int(),
    runsPerSet: z.number().int(),
    bootstrapResamples: z.number().int(),
    delayModels: z.array(z.enum(["folded", "netem"])),
    captureManifests: z.array(z.object({ runId: z.string(), manifest: z.record(z.string(), z.unknown()) })),
    note: z.string(),
  }),
  settings: z.object({
    nominal: z.number(),
    fixedRule: z.object({ meanLimit: z.number(), stdLimit: z.number() }),
    percentile: z.number(),
    windowSizes: z.array(z.number().int()),
    defaultWindow: z.number().int(),
    features: z.array(z.string()),
    channels: z.array(z.object({ name: z.string(), gap0: z.number(), gap1: z.number() })),
    conditions: z.array(z.object({ name: z.string(), netJitter: z.number(), loss: z.number() })),
  }),
  runs: z.array(runSchema),
  baselines: z.array(z.object({
    id: z.string(), kind: z.enum(["clean", "matched"]), condition: z.string(), delayModel, source,
    window: z.number().int(), step: z.number().int(), percentile: z.number(), nWindows: z.number().int(),
    lower: z.record(z.string(), z.number().nullable()), upper: z.record(z.string(), z.number().nullable()),
    reference: z.array(z.number()).nullable(),
  })),
  matrix: z.array(z.object({
    source, channel: z.string(), condition: z.string(), delayModel, window: z.number().int(),
    detector: z.enum(["fixed", "baseline (clean)", "baseline (matched)"]),
    detectionRate: rate, falsePositiveRate: rate, precision: rate,
    nCovertWindows: z.number().int(), nNormalWindows: z.number().int(), runsPerSet: z.number().int(),
    ci, decodeFixed: rate, decodeAdaptive: rate, runIds: z.array(z.string()),
  })),
  features: z.array(z.object({
    source, channel: z.string(), condition: z.string(), delayModel, window: z.number().int(), baseline: z.enum(["clean", "matched"]),
    rows: z.array(z.object({ feature: z.string(), auc: rate, detectionRate: rate, falsePositiveRate: rate, ci })),
  })),
  roc: z.array(z.object({
    source, channel: z.string(), condition: z.string(), delayModel, window: z.number().int(), feature: z.string(),
    auc: rate, operatingThreshold: z.number().nullable(),
    points: z.array(z.object({ threshold: z.number().nullable(), fpr: rate, tpr: rate, precision: rate })),
  })),
  decode: z.array(z.object({
    runId: z.string(), source, sent: bitString, fixedThreshold: z.number(), adaptiveThreshold: z.number().nullable(),
    decodedFixed: bitString, decodedAdaptive: bitString, accuracyFixed: rate, accuracyAdaptive: rate,
    channel: z.string().nullable(), condition: z.string(), delayModel,
  })),
  fieldcheck: z.array(z.object({
    condition: z.string(), normalFile: z.string(), covertFile: z.string(),
    rows: z.array(z.object({ field: z.string(), normal: z.string().nullable(), covert: z.string().nullable(), differs: z.boolean().nullable(), note: z.string() })),
  })),
  multiSeed: z.object({
    source: z.literal("simulated"), seeds: z.array(z.number().int()), delayModel: z.enum(["folded", "netem"]), runsPerSet: z.number().int(),
    rows: z.array(z.object({ channel: z.string(), condition: z.string(), window: z.number().int(), detector: z.string(), detectionRate: seedStat, falsePositiveRate: seedStat })),
  }).nullable(),
});

export type Bundle = z.infer<typeof bundleSchema>;
export type BundleRun = z.infer<typeof runSchema>;
export type MatrixRow = Bundle["matrix"][number];
export type Source = z.infer<typeof source>;
