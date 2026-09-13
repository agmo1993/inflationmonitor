# packages/data schema

Postgres / Neon compatible. Multi-country: AU, US, GB, CA, EU, EA.

## Tables

### `country`
| Column | Type | Notes |
|--------|------|-------|
| `code` | text PK | ISO-ish code (`AU`, `US`, `GB`, `CA`, `EU`, `EA`) |
| `name` | text | Display name |

### `source`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Stable id (`abs`, `bls`, `ons`, `statcan`, `eurostat`, `eurostat_ea`) |
| `country_code` | text FK → country | Owning country |
| `name` | text | Agency name |
| `homepage_url` | text | Optional |

### `series`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Platform id (see below) |
| `source_id` | text FK → source | |
| `country_code` | text FK → country | |
| `native_id` | text | Agency series identifier |
| `title` | text | |
| `frequency` | text | `monthly` / `quarterly` |
| `unit` | text | default `index` |
| `seasonally_adjusted` | boolean | default false |

Unique: `(source_id, native_id)`.

### `release` (vintage)
| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `source_id` | text FK → source | |
| `label` | text | e.g. `2024-12` |
| `released_at` | timestamptz | Publication time |

Unique: `(source_id, label)`.

### `obs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `series_id` | text FK → series | |
| `release_id` | integer FK → release | Vintage |
| `period` | date | First day of reference period |
| `value` | numeric(18,6) | Index level |

Unique: `(series_id, period, release_id)` — same period can exist across vintages.

## AU series identifiers

| Platform `series.id` | Native id | Description |
|----------------------|-----------|-------------|
| `au.abs.cpi.all_groups` | `A2325846C` | ABS CPI All groups ; Australia (headline, monthly) |

Source id: `abs`. Country: `AU`.

## US series identifiers (BLS CPI-U, not seasonally adjusted)

| Platform `series.id` | Native id (BLS) | Description |
|----------------------|-----------------|-------------|
| `us.bls.cpiu.all_items` | `CUUR0000SA0` | All items (headline) |
| `us.bls.cpiu.food` | `CUUR0000SAF1` | Food |
| `us.bls.cpiu.energy` | `CUUR0000SA0E` | Energy |
| `us.bls.cpiu.all_items_less_food_energy` | `CUUR0000SA0L1E` | All items less food and energy |
| `us.bls.cpiu.shelter` | `CUUR0000SAH1` | Shelter |

Source id: `bls`. Country: `US`.


## UK series identifiers (ONS CPI, MM23, 2015=100, NSA)

Country code is **`GB`** (not `UK`). Source id: `ons`.

| Platform `series.id` | Native id (CDID) | Description |
|----------------------|------------------|-------------|
| `gb.ons.cpi.all_items` | `D7BT` | All items |
| `gb.ons.cpi.food` | `D7BU` | Food and non-alcoholic beverages |
| `gb.ons.cpi.energy` | `D7CH` | Electricity, gas and other fuels (04.5) |
| `gb.ons.cpi.all_items_less_food_energy_alcohol_tobacco` | `DKC6` | Core index (INDEX, not DKO8 rate) |

No housing series in this catalog cut.

Live: `GET https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/{cdid}/mm23/data`

## Canada series identifiers (StatCan table 18-10-0004-01)

Source id: `statcan`. Country: `CA`.

| Platform `series.id` | Native id (vector) | Description |
|----------------------|--------------------|-------------|
| `ca.statcan.cpi.all_items` | `v41690973` | All-items |
| `ca.statcan.cpi.food` | `v41690974` | Food |
| `ca.statcan.cpi.shelter` | `v41691050` | Shelter |
| `ca.statcan.cpi.energy` | `v41691239` | Energy |

Live: `POST https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods`

## EU / euro-area HICP (Eurostat `prc_hicp_minr`, ECOICOP ver.2)

Unit `I15` = index 2015=100 (also available as `I25` = 2025=100 on the same dataflow).
`coicop18` **`TOTAL`** = all-items (ECOICOP1 used `coicop` `CP00`).

| Platform `series.id` | Native id | Country | Source |
|----------------------|-----------|---------|--------|
| `eu.eurostat.hicp.all_items` | `prc_hicp_minr.M.I15.TOTAL.EU27_2020` | `EU` | `eurostat` |
| `ea.eurostat.hicp.all_items` | `prc_hicp_minr.M.I15.TOTAL.EA20` | `EA` | `eurostat_ea` |

Geo notes: **EU27_2020** (not bare `EU`); **EA20** (not EA19).
Platform ids are stable across the ECOICOP1→ECOICOP2 migration; only native/fetch mapping changed.

Live: `GET https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_minr/M.I15.TOTAL.EU27_2020+EA20?format=TSV&startPeriod=YYYY-MM`

**Migration note:** archived `prc_hicp_midx` / `I15` / `CP00` freezes at **2025-12**. Successor table `prc_hicp_minr` merges former monthly index + rate datasets under ECOICOP ver.2 and continues I15 (and I25) from 1996 through current months.


## ER sketch

```
country 1──* source 1──* series 1──* obs
                │                    │
                └──* release ────────┘
```
