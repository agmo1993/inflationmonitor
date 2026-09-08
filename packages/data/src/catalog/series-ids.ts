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
