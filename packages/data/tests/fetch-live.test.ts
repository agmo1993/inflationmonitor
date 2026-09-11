import { describe, expect, it } from "vitest";
import { AU, US, US_SERIES_LIST } from "../src/catalog/series-ids.js";
import {
  ABS_CPI_DATAFLOW,
  ABS_CPI_SDMX_DATA_KEY,
  buildAbsCpiUrl,
  fetchAuAbsCpiLive,
  parseAbsCpiCsv,
} from "../src/loaders/fetch-au-abs.js";
import {
  BLS_API_URL,
  fetchUsBlsCpiLive,
} from "../src/loaders/fetch-us-bls.js";

const NOW = new Date("2026-09-11T12:00:00Z");
const US_NATIVE_IDS = US_SERIES_LIST.map((s) => s.nativeId);

const ABS_CSV = `STRUCTURE,STRUCTURE_ID,MEASURE,INDEX,TSEST,REGION,FREQ,TIME_PERIOD,OBS_VALUE
DATAFLOW,ABS:CPI(2.0.0),1,10001,10,50,M,2026-06,102.03
DATAFLOW,ABS:CPI(2.0.0),1,10001,10,50,M,2026-07,103.07
DATAFLOW,ABS:CPI(2.0.0),3,10001,10,50,M,2026-07,2.5
`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ABS live fetch wrapper", () => {
  it("builds the SDMX All-groups monthly URL", () => {
    const url = buildAbsCpiUrl({ startPeriod: "2016-01", endPeriod: "2026-09" });
    expect(url).toContain("https://data.api.abs.gov.au/rest/data");
    expect(url).toContain(ABS_CPI_DATAFLOW);
    expect(url).toContain(ABS_CPI_SDMX_DATA_KEY);
    expect(url).toContain("startPeriod=2016-01");
    expect(url).toContain("endPeriod=2026-09");
    expect(url).toContain("format=csvfilewithlabels");
  });

  it("returns an AuAbsFixture-shaped payload using native A2325846C", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain(ABS_CPI_DATAFLOW);
      expect(url).toContain(ABS_CPI_SDMX_DATA_KEY);
      expect(url).toContain("startPeriod=2016-01");
      expect(url).toContain("endPeriod=2026-09");
      return new Response(ABS_CSV, { status: 200 });
    }) as typeof fetch;

    const payload = await fetchAuAbsCpiLive({ fetchImpl, now: NOW });
    expect(payload.source).toBe(AU.sourceId);
    expect(payload.seriesNativeId).toBe(AU.headline.nativeId);
    expect(payload.seriesTitle).toBe(AU.headline.title);
    expect(payload.releaseLabel).toBe("2026-07");
    expect(payload.observations).toEqual([
      { period: "2026-06-01", value: 102.03 },
      { period: "2026-07-01", value: 103.07 },
    ]);
    expect(payload.fetchMeta.observationCount).toBe(2);
    expect(payload.fetchMeta.endpointUsed).toContain("data.api.abs.gov.au");
  });

  it("throws on ABS HTTP error (no silent empty load)", async () => {
    const fetchImpl = (async () =>
      new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(fetchAuAbsCpiLive({ fetchImpl, now: NOW })).rejects.toThrow(
      /ABS Data API HTTP 503/,
    );
  });

  it("throws when CSV is missing TIME_PERIOD/OBS_VALUE", () => {
    expect(() => parseAbsCpiCsv("FOO,BAR\n1,2\n")).toThrow(/TIME_PERIOD/);
  });

  it("throws when CSV has no monthly observations", () => {
    expect(() =>
      parseAbsCpiCsv("TIME_PERIOD,OBS_VALUE\n2026-Q2,101\n"),
    ).toThrow(/no monthly/);
  });
});

describe("BLS live fetch wrapper", () => {
  function succeededApiBody() {
    return {
      status: "REQUEST_SUCCEEDED",
      Results: {
        series: US_NATIVE_IDS.map((seriesID) => ({
          seriesID,
          data: [
            { year: "2026", period: "M07", value: "333.000" },
            { year: "2026", period: "M08", value: "334.000" },
            { year: "2026", period: "M13", value: "999" },
          ],
        })),
      },
    };
  }

  const htmlTable = `
<table>
<tr><TH scope="row">2026</TH><TD>1</TD><TD>2</TD><TD>3</TD><TD>4</TD><TD>5</TD><TD>6</TD><TD>7</TD><TD>8.5</TD><TD></TD><TD></TD><TD></TD><TD></TD></tr>
</table>`;

  it("returns a UsBlsFixture with all five required series and latest label", async () => {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(BLS_API_URL);
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.seriesid).toEqual(US_NATIVE_IDS);
      expect(body.startyear).toBe("2016");
      expect(body.endyear).toBe("2026");
      return jsonResponse(succeededApiBody());
    }) as typeof fetch;

    const payload = await fetchUsBlsCpiLive({ fetchImpl, now: NOW });
    expect(payload.source).toBe(US.sourceId);
    expect(payload.releaseLabel).toBe("2026-08");
    expect(payload.series.map((s) => s.nativeId)).toEqual(US_NATIVE_IDS);
    expect(payload.series[0]?.observations.at(-1)).toEqual({
      period: "2026-08-01",
      value: 334,
    });
    expect(payload.fetchMeta.source).toBe("api");
    expect(payload.fetchMeta.observationCount).toBe(US_NATIVE_IDS.length * 2);
  });

  it("falls back to data.bls.gov HTML when the API reports a quota threshold", async () => {
    let apiCalls = 0;
    let htmlCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.bls.gov")) {
        apiCalls += 1;
        return jsonResponse({
          status: "REQUEST_NOT_PROCESSED",
          message: ["daily threshold"],
        });
      }
      htmlCalls += 1;
      expect(url).toMatch(/data\.bls\.gov\/timeseries\/CUUR0000/);
      return new Response(htmlTable, { status: 200 });
    }) as typeof fetch;

    const payload = await fetchUsBlsCpiLive({ fetchImpl, now: NOW });
    expect(apiCalls).toBe(1);
    expect(htmlCalls).toBe(US_NATIVE_IDS.length);
    expect(payload.fetchMeta.source).toBe("html");
    expect(payload.source).toBe(US.sourceId);
    expect(payload.releaseLabel).toBe("2026-08");
    expect(payload.series).toHaveLength(US_NATIVE_IDS.length);
  });

  it("does not HTML-fallback on a non-quota BLS HTTP error", async () => {
    const fetchImpl = (async () =>
      new Response("down", { status: 500 })) as typeof fetch;
    await expect(fetchUsBlsCpiLive({ fetchImpl, now: NOW })).rejects.toThrow(
      /BLS API HTTP 500/,
    );
  });
});
