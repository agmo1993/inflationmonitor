# packages/data schema

Postgres / Neon compatible. Multi-country from day one (AU + US seeded).

## Tables

### `country`
| Column | Type | Notes |
|--------|------|-------|
| `code` | text PK | ISO-ish code (`AU`, `US`) |
| `name` | text | Display name |

### `source`
| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Stable id (`abs`, `bls`) |
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

## ER sketch

```
country 1──* source 1──* series 1──* obs
                │                    │
                └──* release ────────┘
```
