import { describe, expect, it } from "vitest";
import { parseAbsCpiCsv } from "../src/loaders/fetch-au-abs.js";
import {
  blsPeriodToDate,
  parseBlsApiSeriesData,
  parseBlsHtmlSeriesTable,
} from "../src/loaders/fetch-us-bls.js";
import {
  onsMonthToPeriod,
  parseOnsTimeseriesMonths,
} from "../src/loaders/fetch-uk-ons.js";
import {
  nativeIdToVectorId,
  parseStatcanVectorPoints,
} from "../src/loaders/fetch-ca-statcan.js";
import {
  EUROSTAT_HICP_DATAFLOW,
  EUROSTAT_HICP_KEY_PREFIX,
  buildEurostatHicpUrl,
  geoFromNativeId,
  parseEurostatHicpTsv,
} from "../src/loaders/fetch-eu-hicp.js";

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

describe("ONS timeseries parser", () => {
  it("maps month name + year to YYYY-MM-01", () => {
    expect(onsMonthToPeriod({ year: "2026", month: "July" })).toBe("2026-07-01");
    expect(onsMonthToPeriod({ year: "2026", month: "May" })).toBe("2026-05-01");
    expect(onsMonthToPeriod({ year: "2026" })).toBeNull();
  });

  it("parses monthly rows and respects startPeriod", () => {
    const obs = parseOnsTimeseriesMonths(
      [
        { year: "2024", month: "December", value: "134.7" },
        { year: "2025", month: "January", value: "135.0" },
        { year: "2025", month: "February", value: "bad" },
      ],
      { startPeriod: "2025-01-01" },
    );
    expect(obs).toEqual([{ period: "2025-01-01", value: 135 }]);
  });
});

describe("StatCan WDS parser", () => {
  it("strips v prefix from vector native ids", () => {
    expect(nativeIdToVectorId("v41690973")).toBe(41690973);
    expect(nativeIdToVectorId("41690973")).toBe(41690973);
  });

  it("parses refPer points into first-of-month ObsPoint[]", () => {
    const obs = parseStatcanVectorPoints([
      { refPer: "2024-11-01", value: 161.7 },
      { refPer: "2024-12-01", value: "162.0" },
      { refPer: "2024-10", value: 161.4 },
    ]);
    expect(obs).toEqual([
      { period: "2024-10-01", value: 161.4 },
      { period: "2024-11-01", value: 161.7 },
      { period: "2024-12-01", value: 162 },
    ]);
  });
});

describe("Eurostat HICP TSV parser", () => {
  it("extracts geo from ECOICOP2 native id", () => {
    expect(geoFromNativeId("prc_hicp_minr.M.I15.TOTAL.EU27_2020")).toBe(
      "EU27_2020",
    );
    expect(geoFromNativeId("prc_hicp_minr.M.I15.TOTAL.EA20")).toBe("EA20");
  });

  it("parses ECOICOP2 wide TSV (coicop18 TOTAL) and skips missing ':' cells", () => {
    const tsv =
      "freq,unit,coicop18,geo\\TIME_PERIOD\t2026-06\t2026-07\t2026-08\n" +
      "M,I15,TOTAL,EU27_2020\t136.96\t137.30\t:\n" +
      "M,I15,TOTAL,EA20\t136.96\t137.30\t137.80 e\n";
    const byGeo = parseEurostatHicpTsv(tsv);
    expect(byGeo.get("EU27_2020")).toEqual([
      { period: "2026-06-01", value: 136.96 },
      { period: "2026-07-01", value: 137.3 },
    ]);
    expect(byGeo.get("EA20")?.at(-1)).toEqual({
      period: "2026-08-01",
      value: 137.8,
    });
  });
});

describe("Eurostat HICP ECOICOP2 URL builder", () => {
  it("targets prc_hicp_minr with I15 TOTAL (not archived prc_hicp_midx CP00)", () => {
    expect(EUROSTAT_HICP_DATAFLOW).toBe("prc_hicp_minr");
    expect(EUROSTAT_HICP_KEY_PREFIX).toBe("M.I15.TOTAL");
    const url = buildEurostatHicpUrl({
      geos: ["EU27_2020", "EA20"],
      startPeriod: "2016-01",
    });
    expect(url).toContain("/data/prc_hicp_minr/");
    expect(url).toContain("M.I15.TOTAL.EU27_2020+EA20");
    expect(url).toContain("format=TSV");
    expect(url).toContain("startPeriod=2016-01");
    expect(url).not.toContain("prc_hicp_midx");
    expect(url).not.toContain("CP00");
  });
});
