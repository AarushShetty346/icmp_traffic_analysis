import { describe, expect, it } from "vitest";
import { parseCaptureCsv } from "./csv";
import { fromUpload } from "./runs";

describe("import provenance", () => {
  it("keeps an ordinary timestamp CSV unverified until a person labels its source", () => {
    const parsed = parseCaptureCsv("frame.time_epoch,icmp.seq\n10,1\n11,2\n", "covert_example.csv");
    const run = fromUpload(parsed, 1);
    expect(run.source).toBe("unverified");
    expect(run.label).toBe("covert");
  });

  it("recognises explicitly marked simulated rows, but not a simulated=0 column", () => {
    const generated = parseCaptureCsv("frame.time_epoch,simulated\n10,1\n11,1\n", "generated.csv");
    const unknown = parseCaptureCsv("frame.time_epoch,simulated\n10,0\n11,0\n", "unknown.csv");
    expect(fromUpload(generated, 1).source).toBe("simulated");
    expect(fromUpload(unknown, 2).source).toBe("unverified");
  });
});
