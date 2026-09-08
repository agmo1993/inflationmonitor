/** Hard monthly spend cap per account (USD). Exactly this amount = over-cap. */
export const MONTHLY_SPEND_CAP_USD = 5.0;

/** Stable machine-readable code returned when the monthly cap is hit. */
export const LIMIT_REACHED_CODE = "LIMIT_REACHED" as const;

/** HTTP status used for limit-reached responses (Payment Required). */
export const LIMIT_REACHED_STATUS = 402 as const;
