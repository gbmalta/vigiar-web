export type Check = {
  dimension: string;
  name: string;
  numerator: number;
  denominator: number;
  rate: number | null;
  note: string;
};
export type Delay = {
  q25: number | null;
  median: number | null;
  q75: number | null;
  p90: number | null;
  p95: number | null;
  valid: number;
  max: number | null;
  histogram: { label: string; n: number }[];
};
export type Timeliness = {
  scope: string;
  name: string;
  total: number;
  open: number;
  delay_present: number;
  delay_negative: number;
  closure_present: number;
  closure_negative: number;
  notification: Delay;
  closure: Delay;
};
export type BinResult = {
  nonEvent: number;
  event: number;
  woe: number | null;
  contribution: number | null;
};
export type Bin = {
  missing: boolean;
  lower: number | null;
  upper: number | null;
  dev: BinResult;
  evaluation: BinResult;
};
export type Interval = {
  low: number | null;
  high: number | null;
  valid: number;
  clusters: number;
};
export type Feature = {
  id: string;
  name: string;
  block: string;
  description: string;
  unit: string;
  caveat: string | null;
  status: string;
  cuts: number[];
  ivDev: number | null;
  ivEvaluation: number | null;
  missingDev: number;
  missingEvaluation: number;
  psi: number | null;
  signComparable: number;
  signSame: number;
  bins: Bin[];
  devCI?: Interval;
  evaluationCI?: Interval;
  cities?: {
    city: string;
    ivDev: number | null;
    ivEvaluation: number | null;
    evaluationRows: number;
    events: number;
  }[];
};
export type CityResult = {
  id: string;
  name: string;
  threshold: number;
  devRows: number;
  devEvents: number;
  evaluationRows: number;
  evaluationEvents: number;
  devClimateRows: number;
  evaluationClimateRows: number;
};
export type Analysis = {
  evaluationStart: string;
  evaluationEnd: string;
  devStart: string;
  devEnd: string;
  devRows: number;
  evaluationRows: number;
  purgedRows: number;
  cities: CityResult[];
  features: Feature[];
  blocks: {
    name: string;
    features: number;
    estimated: number;
    medianDev: number | null;
    maxDev: number | null;
    medianEvaluation: number | null;
    maxEvaluation: number | null;
  }[];
  secondary: Analysis;
};
export type Quality = {
  inventory: { table: string; rows: number; columns: number; files: number }[];
  missingness: {
    table: string;
    column: string;
    type: string;
    rows: number;
    nulls: number | null;
    completeness: number | null;
  }[];
  checks: Check[];
  timeliness: Timeliness[];
  spatial: {
    city: string;
    name: string;
    facilities: number;
    coordinates: number;
    bounds: number;
    linked: number;
    udh: number;
  }[];
  funnel: {
    stage: string;
    n: number;
    retained: number;
    lossPrevious: number;
  }[];
};
export type Method = {
  builtAt: string;
  runId: string;
  paper: { title: string; status: string; sha256: string };
  sources: { file: string; bytes: number; sha256: string }[];
  range: {
    min: string;
    max: string;
    firstFullWeek: string;
    lastFullWeek: string;
    lastFullDay: string;
  };
  totals: Record<string, number>;
  annual: Record<string, number>;
  panelRows: number;
  featureCount: number;
  protocol: string[];
  differences: { topic: string; paper: string; edition: string }[];
  unavailable: { metric: string; reason: string }[];
  timelinessNotes: string[];
  funnelNote: string;
  completenessNote: string;
};
export type WeekRow = {
  city: string;
  week: string;
  notifications: number;
  burden: number | null;
  target: number | null;
  threshold: number;
  split: string;
  reporter_coverage: number | null;
};
