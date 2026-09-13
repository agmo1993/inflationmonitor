/** Canonical platform series ids and native agency identifiers. */

export const AU = {
  country: "AU" as const,
  sourceId: "abs" as const,
  /** ABS CPI monthly — All groups CPI, Australia (headline). */
  headline: {
    id: "au.abs.cpi.all_groups",
    /** ABS Data API / series ID for All groups CPI ; Australia */
    nativeId: "A2325846C",
    title: "All groups CPI ; Australia",
    frequency: "monthly" as const,
  },
};

export const US = {
  country: "US" as const,
  sourceId: "bls" as const,
  /** BLS CPI-U (CUUR*) not seasonally adjusted. */
  series: {
    allItems: {
      id: "us.bls.cpiu.all_items",
      nativeId: "CUUR0000SA0",
      title: "CPI-U All items",
      frequency: "monthly" as const,
    },
    food: {
      id: "us.bls.cpiu.food",
      nativeId: "CUUR0000SAF1",
      title: "CPI-U Food",
      frequency: "monthly" as const,
    },
    energy: {
      id: "us.bls.cpiu.energy",
      nativeId: "CUUR0000SA0E",
      title: "CPI-U Energy",
      frequency: "monthly" as const,
    },
    allItemsLessFoodEnergy: {
      id: "us.bls.cpiu.all_items_less_food_energy",
      nativeId: "CUUR0000SA0L1E",
      title: "CPI-U All items less food and energy",
      frequency: "monthly" as const,
    },
    shelter: {
      id: "us.bls.cpiu.shelter",
      nativeId: "CUUR0000SAH1",
      title: "CPI-U Shelter",
      frequency: "monthly" as const,
    },
  },
};

export const US_SERIES_LIST = Object.values(US.series);

/**
 * UK ONS CPI (MM23) — country GB, source ons, monthly NSA index 2015=100.
 * CDIDs: D7BT headline, D7BU food, D7CH energy (04.5 fuels), DKC6 core index.
 * No housing series in this catalog cut.
 */
const GB_ALL_ITEMS = {
  id: "gb.ons.cpi.all_items",
  nativeId: "D7BT",
  title: "CPI INDEX 00: ALL ITEMS 2015=100",
  frequency: "monthly" as const,
};

export const GB = {
  country: "GB" as const,
  sourceId: "ons" as const,
  headline: GB_ALL_ITEMS,
  series: {
    allItems: GB_ALL_ITEMS,
    food: {
      id: "gb.ons.cpi.food",
      nativeId: "D7BU",
      title: "CPI INDEX 01 : FOOD AND NON-ALCOHOLIC BEVERAGES 2015=100",
      frequency: "monthly" as const,
    },
    energy: {
      id: "gb.ons.cpi.energy",
      nativeId: "D7CH",
      title: "CPI INDEX 04.5 : ELECTRICITY, GAS AND OTHER FUELS 2015=100",
      frequency: "monthly" as const,
    },
    allItemsLessFoodEnergyAlcoholTobacco: {
      id: "gb.ons.cpi.all_items_less_food_energy_alcohol_tobacco",
      nativeId: "DKC6",
      title:
        "CPI INDEX: Excluding Energy, food, alcoholic beverages & tobacco 2015=100",
      frequency: "monthly" as const,
    },
  },
};

export const GB_SERIES_LIST = Object.values(GB.series);

/**
 * Canada StatCan CPI — table 18-10-0004-01, Canada geography, monthly NSA.
 * Vectors: v41690973 all-items, v41690974 food, v41691050 shelter, v41691239 energy.
 */
const CA_ALL_ITEMS = {
  id: "ca.statcan.cpi.all_items",
  nativeId: "v41690973",
  title: "CPI All-items, Canada",
  frequency: "monthly" as const,
};

export const CA = {
  country: "CA" as const,
  sourceId: "statcan" as const,
  headline: CA_ALL_ITEMS,
  series: {
    allItems: CA_ALL_ITEMS,
    food: {
      id: "ca.statcan.cpi.food",
      nativeId: "v41690974",
      title: "CPI Food, Canada",
      frequency: "monthly" as const,
    },
    shelter: {
      id: "ca.statcan.cpi.shelter",
      nativeId: "v41691050",
      title: "CPI Shelter, Canada",
      frequency: "monthly" as const,
    },
    energy: {
      id: "ca.statcan.cpi.energy",
      nativeId: "v41691239",
      title: "CPI Energy, Canada",
      frequency: "monthly" as const,
    },
  },
};

export const CA_SERIES_LIST = Object.values(CA.series);

/**
 * EU27 HICP (Eurostat prc_hicp_minr ECOICOP ver.2, unit I15=2015=100, coicop18 TOTAL).
 * Geo EU27_2020 (not bare "EU"). Platform id stable; native maps post-freeze flow.
 * Archived predecessor: prc_hicp_midx.M.I15.CP00.* (frozen at 2025-12).
 */
const EU_ALL_ITEMS = {
  id: "eu.eurostat.hicp.all_items",
  nativeId: "prc_hicp_minr.M.I15.TOTAL.EU27_2020",
  title: "HICP All-items (EU27_2020, 2015=100)",
  frequency: "monthly" as const,
};

export const EU = {
  country: "EU" as const,
  sourceId: "eurostat" as const,
  headline: EU_ALL_ITEMS,
  series: {
    allItems: EU_ALL_ITEMS,
  },
};

export const EU_SERIES_LIST = Object.values(EU.series);

/**
 * Euro area HICP — EA20 (not EA19), ECOICOP2 prc_hicp_minr.
 * Country code EA, source eurostat_ea. Platform id stable.
 */
const EA_ALL_ITEMS = {
  id: "ea.eurostat.hicp.all_items",
  nativeId: "prc_hicp_minr.M.I15.TOTAL.EA20",
  title: "HICP All-items (EA20, 2015=100)",
  frequency: "monthly" as const,
};

export const EA = {
  country: "EA" as const,
  sourceId: "eurostat_ea" as const,
  headline: EA_ALL_ITEMS,
  series: {
    allItems: EA_ALL_ITEMS,
  },
};

export const EA_SERIES_LIST = Object.values(EA.series);

/** Combined EU27 + EA20 series required by the Eurostat HICP loader. */
export const EU_HICP_SERIES_LIST = [...EU_SERIES_LIST, ...EA_SERIES_LIST];
