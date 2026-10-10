import { describe, expect, it } from "vitest";
import { parseCaptureCsv, parseIntLoose } from "./csv";

describe("parseCaptureCsv", () => {
  it("reads tshark output, filters by source, keeps sequence numbers", () => {
    const csv = "frame.time_epoch,ip.src,ip.dst,icmp.ident,icmp.seq\n10.0,10.0.0.1,10.0.0.2,0x0001,1/256\n10.5,10.0.0.9,10.0.0.2,0x0001,7/1792\n11.0,10.0.0.1,10.0.0.2,0x0001,2/512\n12.0,10.0.0.1,10.0.0.2,0x0001,3/768\n";
    const p = parseCaptureCsv(csv, "x.csv", { src: "10.0.0.1" });
    expect(p.times).toEqual([10, 11, 12]);
    expect(p.seq).toEqual([1, 2, 3]);
    expect(p.simulated).toBe(false);
  });
  it("detects files written by the simulator", () => {
    expect(parseCaptureCsv("frame.time_epoch,icmp.seq,simulated\n0,0,1\n1,1,1\n", "s.csv").simulated).toBe(true);
  });
  it("rejects files without timestamps", () => {
    expect(() => parseCaptureCsv("a,b\n1,2\n3,4\n", "bad.csv")).toThrow(/timestamp/);
  });
  it("parses identifiers in any notation", () => {
    expect(["0x0001", "1", "01", "1/256"].map(parseIntLoose)).toEqual([1, 1, 1, 1]);
  });
});
