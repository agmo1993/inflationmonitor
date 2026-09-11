import { describe, expect, it } from "vitest";
import { parseAbsCpiCsv } from "../src/loaders/fetch-au-abs.js";
import {
  blsPeriodToDate,
  parseBlsApiSeriesData,
  parseBlsHtmlSeriesTable,
} from "../src/loaders/fetch-us-bls.js";

describe("ABS CPI CSV parser", () => {
  it("parses monthly All groups rows into YYYY-MM-01", () => {
    const csv = `STRUCTURE,STRUCTURE_ID,MEASURE,INDEX,TSEST,REGION,FREQ,TIME_PERIOD,OBS_VALUE
DATAFLOW,ABS:CPI(2.0.0),1,10001,10,50,M,2026-06,102.03
DATAFLOW,ABS:CPI(2.0.0),1,10001,10,50,M,2026-07,103.07
DATAFLOW,ABS:CPI(2.0.0),3,10001,10,50,M,2026-07,2.5
DATAFLOW,ABS:CPI(2.0.0),1,10001,10,50,Q,2026-Q2,102.31
`;
    const obs = parseAbsCpiCsv(csv);
    expect(obs).toEqual([
      { period: "2026-06-01", value: 102.03 },
      { period: "2026-07-01", value: 103.07 },
    ]);
  });
});

describe("BLS parsers", () => {
  it("maps M01..M12 to first-of-month dates", () => {
    expect(blsPeriodToDate("2026", "M08")).toBe("2026-08-01");
    expect(blsPeriodToDate("2026", "M13")).toBeNull();
    expect(blsPeriodToDate("2026", "Q01")).toBeNull();
  });

  it("parses API monthly data and skips annual averages", () => {
    const obs = parseBlsApiSeriesData([
      { year: "2026", period: "M08", value: "334.980" },
      { year: "2026", period: "M07", value: "333.918" },
      { year: "2026", period: "M13", value: "999" },
    ]);
    expect(obs).toEqual([
      { period: "2026-07-01", value: 333.918 },
      { period: "2026-08-01", value: 334.98 },
    ]);
  });

  it("parses HTML year rows and skips unavailable placeholders", () => {
    const html = `
<table>
<tr><TH scope="row">2025</TH><TD>317.671</TD><TD>319.082</TD><TD>319.799</TD><TD>320.795</TD><TD>321.465</TD><TD>322.561</TD><TD>323.048</TD><TD>323.976</TD><TD>324.800</TD><TD>&nbsp;-(X)</TD><TD>324.122</TD><TD>324.054</TD><TD>320.229</TD></tr>
<tr><TH scope="row">2026</TH><TD>325.252</TD><TD>326.785</TD><TD>330.213</TD><TD>333.020</TD><TD>335.123</TD><TD>333.952</TD><TD>333.918</TD><TD>334.980</TD><TD>&nbsp;</TD><TD>&nbsp;</TD><TD>&nbsp;</TD><TD>&nbsp;</TD><TD></TD></tr>
</table>`;
    const obs = parseBlsHtmlSeriesTable(html);
    expect(obs.find((o) => o.period === "2025-10-01")).toBeUndefined();
    expect(obs.find((o) => o.period === "2026-08-01")?.value).toBe(334.98);
    expect(obs.find((o) => o.period === "2025-09-01")?.value).toBe(324.8);
  });
});
