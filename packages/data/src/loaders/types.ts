export type ObsPoint = {
  period: string; // YYYY-MM-DD
  value: number;
};

export type LoadResult = {
  sourceId: string;
  releaseId: number;
  releaseLabel: string;
  seriesLoaded: string[];
  observationCount: number;
};
