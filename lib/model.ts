// Token Launch Radar — the value model (radar-2).
//
// A protocol's launch is the token it may issue one day. This file turns the
// frozen DefiLlama snapshot into a ranked board of launch candidates. It does
// not predict whether or when a token is issued: the implied value is the
// entry's own claim, built only from the snapshot's own figures.
//
//   implied = round(TVL x categoryMultiple x growth x maturity)
//
// - categoryMultiple is the market's own pricing: the median mcap/TVL of the
//   live-token protocols in the same category. A token worth $0 carries no
//   price signal, so $0 market caps are left out of the median. A category
//   needs at least 3 priced samples; anything thinner falls back to the
//   global median over all priced live tokens. The multiple is clamped to
//   0.05x..1.00x so a thin category cannot blow the board up (one live
//   Prediction Market token prices at 400x its TVL; no board should pay that).
// - growth is the protocol's 7-day TVL change, clamped to -60%..+120% and
//   taken at half weight: 1 + 0.5 x clamped(change_7d) / 100. No 7-day figure
//   recorded means no adjustment (1.0).
// - maturity is 0.6 + min(age, 1095 days) / 1095 x 0.4, where age is the days
//   from listed_at to the snapshot's as_of date. A protocol that has run
//   three years with no token scores 1.0; one listed yesterday scores 0.6.
//   No listed date recorded means age 0.
//
// Candidates are the protocols that record no token and are not a wrapped,
// staked, bridged, exchange or versioned product of a token that already
// trades. Those products are set aside with the reason each is not a launch
// (WBTC is Bitcoin on Ethereum; Binance staked ETH is ETH in Binance's
// staking product), instead of being ranked above real candidates. The
// snapshot's watchlist is the floor, never the ceiling: a candidate below
// its $50M floor ranks on the same terms as one above it.
//
// No protocol name is special-cased anywhere in this file.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Categories whose products are, by construction, a form of a token that already trades. */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol name must not start with (a product of that exchange). */
export const EXCHANGE_PREFIXES: readonly string[] = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** A trailing version marker: a space followed by V2, v2, 2.0 or the like. */
export const VERSION_SUFFIX: RegExp = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name. */
export const WRAPPED_WORD: RegExp = /\b(wrapped|staked|staking)\b/i;

/** The least priced live samples a category needs before its own median is trusted. */
export const MIN_CATEGORY_SAMPLES = 3;
/** The multiple is never trusted outside this band. */
export const MULTIPLE_LOW = 0.05;
export const MULTIPLE_HIGH = 1.0;
/** Maturity reaches its full value after this many days with no token. */
export const MATURITY_DAYS = 1095;

/** True when DefiLlama records any token for the protocol. */
export function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/**
 * Why a pre-token protocol is not a launch candidate, or null when it is one.
 * The checks run in a fixed order so the reason is deterministic: category
 * first (a bridge is a bridge whatever its name says), then a versioned
 * name, then a wrapped/staked word, then an exchange prefix.
 */
export function setAsideReason(p: Protocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return (
      `Category ${p.category}: a bridged, staked or exchange product of a ` +
      `token that already trades, not a protocol still waiting on a launch of its own.`
    );
  }
  if (VERSION_SUFFIX.test(p.name)) {
    return (
      `Versioned release: the name ends in a version marker, so this is a later ` +
      `release of a protocol rather than a fresh launch.`
    );
  }
  if (WRAPPED_WORD.test(p.name)) {
    return (
      `Wrapped or staked product: the name marks it as a wrapped or staked form ` +
      `of a token that already trades.`
    );
  }
  for (const exchange of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(exchange)) {
      return (
        `Exchange product: the name starts with ${exchange}, so this is that ` +
        `exchange's product rather than a protocol still waiting on a launch.`
      );
    }
  }
  return null;
}

/** True when the protocol records no token and no set-aside reason applies. */
export function isLaunchCandidate(p: Protocol): boolean {
  return !hasToken(p) && setAsideReason(p) === null;
}

/** Whole days from listed_at to the snapshot date; 0 when no date is recorded. */
export function ageDays(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 0;
  const listed = Date.parse(`${p.listed_at}T00:00:00Z`);
  const at = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(at)) return 0;
  return Math.max(0, Math.floor((at - listed) / 86_400_000));
}

/** 1 + half the clamped 7-day TVL change; 1 when no change is recorded. */
export function growthMultiplier(change7d: number | null): number {
  if (change7d === null) return 1;
  const clamped = Math.min(120, Math.max(-60, change7d));
  return 1 + (0.5 * clamped) / 100;
}

/** 0.6 for a brand-new listing, rising to 1.0 after MATURITY_DAYS days. */
export function maturityMultiplier(age: number): number {
  return 0.6 + (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS) * 0.4;
}

/** The middle value, or the mean of the two middle values for an even count. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface CategoryCalibration {
  category: string;
  /** Priced (mcap > 0) live-token samples in the category. */
  samples: number;
  /** The category's median ratio, or null when it has no priced sample. */
  median: number | null;
  /** The multiple the board uses for this category (clamped). */
  multiple: number;
  /** 'category' when the category's own median is used, else 'global'. */
  source: 'category' | 'global';
}

/**
 * The market's pricing per category, plus the global fallback. A category
 * trusts its own median only with MIN_CATEGORY_SAMPLES priced samples;
 * anything thinner, and any category with no priced sample at all, uses the
 * global median over every priced live token in the snapshot.
 */
export function categoryMultiples(protocols: Protocol[]): {
  byCategory: Map<string, CategoryCalibration>;
  globalMedian: number;
  globalSamples: number;
} {
  const live = protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const priced = live.filter((p) => p.mcap_usd! > 0);
  const globalMedian = median(priced.map((p) => p.mcap_usd! / p.tvl_usd));
  const clamp = (v: number): number => Math.min(MULTIPLE_HIGH, Math.max(MULTIPLE_LOW, v));

  const ratiosByCategory = new Map<string, number[]>();
  for (const p of priced) {
    const key = p.category ?? '(no category)';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }

  const byCategory = new Map<string, CategoryCalibration>();
  const categories = new Set(protocols.map((p) => p.category ?? '(no category)'));
  for (const category of categories) {
    const samples = ratiosByCategory.get(category) ?? [];
    if (samples.length >= MIN_CATEGORY_SAMPLES) {
      const med = median(samples);
      byCategory.set(category, { category, samples: samples.length, median: med, multiple: clamp(med), source: 'category' });
    } else {
      byCategory.set(category, {
        category,
        samples: samples.length,
        median: samples.length > 0 ? median(samples) : null,
        multiple: clamp(globalMedian),
        source: 'global',
      });
    }
  }
  return { byCategory, globalMedian, globalSamples: priced.length };
}

/** The implied value of a launch: TVL times the model, rounded to whole dollars. */
export function impliedValue(
  tvlUsd: number,
  multiple: number,
  growth: number,
  maturity: number,
): number {
  return Math.round(tvlUsd * multiple * growth * maturity);
}

export interface RadarRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  category_multiple: number;
  multiple_samples: number;
  multiple_source: 'category' | 'global';
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  rank: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  ratio: number;
  age_days: number;
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/**
 * The core on-chain action for a category: what a reader actually does with
 * the protocol. Anything not listed here gets the generic interaction below;
 * the map is keyed by DefiLlama category, never by protocol name.
 */
const CATEGORY_ACTION: Record<string, string> = {
  'Risk Curators':
    'Deposit into one of its vaults or curator strategies and leave the position open, so the address is on record as a depositor before any token exists.',
  Lending:
    'Supply collateral and open a small borrow against it, then repay the borrow, so the address shows both sides of the lending market.',
  Dexs: 'Swap a small amount and add a little liquidity to one pool, then remove half of it a week later, so the address shows maker and taker activity.',
  Yield:
    'Deposit into a yield vault or strategy and leave it earning, so the address is on record as a depositor.',
  'Yield Aggregator':
    'Deposit into an aggregated vault and hold the position, so the address shows up as a depositor across the strategies it routes to.',
  RWA: 'Buy or mint a small tokenized real-world-asset position and hold it, so the address is on record as a holder.',
  Derivatives:
    'Open a small derivatives position and close it after a few days, so the address shows real trading activity.',
  'Interest Rate Derivatives':
    'Open a small interest-rate position and hold it through one rate move, so the address shows real usage.',
  CDP: 'Lock collateral and mint a small amount of the stablecoin, then repay it, so the address shows a full borrow cycle.',
  'CDP Manager':
    'Open a managed CDP position with a small amount of collateral and close it after a few days, so the address shows a full cycle.',
  'Dual-Token Stablecoin':
    'Mint a small amount of the stablecoin against collateral and redeem it, so the address shows a full mint-and-redeem cycle.',
  'Stablecoin Wrapper':
    'Wrap a small amount into the wrapped stablecoin and unwrap it again, so the address shows both directions of the wrapper.',
  'Basis Trading':
    'Deposit into a basis or delta-neutral vault and hold the position, so the address is on record as a depositor.',
  Chain:
    'Bridge assets onto the chain and use one native application, so the address is active on the chain itself.',
  'Staking Pool':
    'Stake a small amount through the pool and leave it staked, so the address is on record as a staker.',
  Restaking:
    'Restake a small amount and leave it restaked, so the address is on record as a restaker.',
  'Onchain Capital Allocator':
    'Allocate a small amount into one of its vaults and hold the position, so the address is on record as an allocator.',
  'Liquidity Manager':
    'Deposit into a managed liquidity position and leave it working, so the address shows up as a liquidity provider.',
  'Anchor BTC':
    'Deposit a small amount of BTC into its vault and hold the position, so the address is on record as a depositor.',
  'Decentralized BTC':
    'Mint a small amount of its BTC-backed asset and hold it, so the address is on record as a holder.',
  CeDeFi:
    'Deposit a small amount into a CeDeFi vault and hold the position, so the address is on record as a depositor.',
  'OTC Marketplace':
    'Complete one small over-the-counter trade on the marketplace, so the address shows real trading activity.',
  Insurance:
    'Buy a small cover policy for one of your positions, so the address is on record as a policyholder.',
  Payments:
    'Make one real payment through the protocol and keep the receipt, so the address shows genuine payment activity.',
  'Governance Incentives':
    'Lock a small amount for governance incentives and vote on one proposal, so the address shows up as a participant.',
  'Crypto Card Issuer':
    'Order the card and make one purchase with it, so the address is linked to real card activity.',
  'Prediction Market':
    'Place a small prediction on one market and let it resolve, so the address shows real market activity.',
  Indexes:
    'Buy a small index position and hold it, so the address is on record as a holder.',
  'Collateral Markets':
    'Supply a small amount of collateral to one of its markets, so the address shows up as a supplier.',
  'Uncollateralized Lending':
    'Take part in one small uncollateralized loan as a lender, so the address shows real lending activity.',
  'Leveraged Farming':
    'Open one small leveraged farming position and close it after a few days, so the address shows real farming activity.',
  Farm: 'Deposit into one of its farms and harvest once, so the address shows a full deposit-and-harvest cycle.',
  'Cross Chain Bridge':
    'Bridge a small amount across one of its routes and back, so the address shows real bridging activity.',
};

const GENERIC_ACTION =
  'Use the protocol once — deposit, swap or borrow a small amount — so the address has a real interaction on record.';

/** The hold window in days, by how long the protocol has run with no token. */
export function holdDays(age: number): number {
  if (age < 365) return 30;
  if (age < 730) return 45;
  return 60;
}

/**
 * Seven concrete steps to farm a protocol, each naming what it costs and how
 * long it takes. The steps are built from the protocol's category, chains
 * and age — never from its name — so the same shape of plan fits every row.
 * No step promises a token: a farm can pay nothing.
 */
export function farmSteps(p: Protocol, age: number): string[] {
  const mainChain = p.chains[0] ?? 'its main chain';
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const hold = holdDays(age);
  const action = p.category !== null && CATEGORY_ACTION[p.category] !== undefined
    ? CATEGORY_ACTION[p.category]!
    : GENERIC_ACTION;
  const chainStep = secondChain !== null
    ? `Repeat the core action on ${secondChain} as well, so the address is active on two chains instead of one. ` +
      `Cost: about $3–$10 in gas. Time: about 30 minutes.`
    : `Repeat the core action once a week for four weeks, so the address shows steady use rather than a single visit. ` +
      `Cost: about $3–$10 in gas a week. Time: about 30 minutes a week.`;
  return [
    `Set up a fresh wallet with a new seed that has never been used anywhere else, and fund it with about $50–$100 of gas money on ${mainChain}; keep the seed offline. Cost: about $50–$100 in gas money. Time: about 15 minutes.`,
    `${action} Cost: about $3–$15 in gas plus the position itself, which stays withdrawable. Time: about 30 minutes.`,
    chainStep,
    `Check whether ${p.name} runs a points program, quests or a leaderboard, and complete the tasks it lists; write each one down with its date. Cost: about $0–$5. Time: about 20 minutes a week.`,
    `Keep the position open for at least ${hold} days without withdrawing it, so the address reads as a holder rather than a passer-by. Cost: no extra cost beyond the position itself. Time: ${hold} days.`,
    `If a token is ever announced, claim only from the protocol's own site or its official channels, check the contract address twice, and never sign a blind approval. No token is guaranteed — a farm can pay nothing. Cost: about $0. Time: about 10 minutes when a claim opens.`,
    `Keep a log of every wallet, transaction hash, amount and date in a notes file, and review it weekly so nothing is missed or double-counted. Cost: about $0. Time: about 10 minutes a week.`,
  ];
}

export interface Radar {
  rows: RadarRow[];
  live: LiveRow[];
  setAside: SetAsideRow[];
  calibration: CategoryCalibration[];
  globalMedian: number;
  globalSamples: number;
}

/**
 * Build the whole radar from a snapshot: the ranked board of launch
 * candidates, the live-token table that calibrates it, and the set-aside
 * table with the reason each protocol is not a launch.
 */
export function buildRadar(snapshot: Snapshot): Radar {
  const { byCategory, globalMedian, globalSamples } = categoryMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);

  const rows: RadarRow[] = [];
  const setAside: SetAsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (hasToken(p)) continue;
    const reason = setAsideReason(p);
    if (reason !== null) {
      setAside.push({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, reason });
      continue;
    }
    const age = ageDays(p, snapshot.as_of);
    const calibration = byCategory.get(p.category ?? '(no category)')!;
    const growth = growthMultiplier(p.change_7d);
    const maturity = maturityMultiplier(age);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      category_multiple: calibration.multiple,
      multiple_samples: calibration.samples,
      multiple_source: calibration.source,
      growth_multiplier: growth,
      maturity_multiplier: maturity,
      implied_value_usd: impliedValue(p.tvl_usd, calibration.multiple, growth, maturity),
      rank: 0,
      watchlist: watchlist.has(p.slug),
      farm_steps: farmSteps(p, age),
    });
  }
  // Highest implied value first; the slug breaks ties so the order is stable.
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((row, i) => { row.rank = i + 1; });
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
    .slice(0, 40)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd!,
      ratio: p.mcap_usd! / p.tvl_usd,
      age_days: ageDays(p, snapshot.as_of),
    }));

  const calibration = [...byCategory.values()].sort((a, b) => (a.category < b.category ? -1 : 1));
  return { rows, live, setAside, calibration, globalMedian, globalSamples };
}
