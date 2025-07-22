# TimescaleDb Client

A **TimescaleDB client** for your architecture would be a service-layer module or microservice that:

* **Wraps access to your TimescaleDB instance**
* **Provides a clean API** to query, insert, and aggregate market data (ticks, OHLC, etc.)
* **Hides schema/SQL internals** from your agents, scrapers, or analyzers

---

## 🧱 **Core Responsibilities of a TimescaleDB Client**

| Responsibility                       | Example Feature/API                                  |
| ------------------------------------ | ---------------------------------------------------- |
| ✅ Ingest tick data                   | `insertTick({ symbol, price, timestamp })`           |
| ✅ Ingest OHLC candles                | `insertOhlc({ symbol, timestamp, open, high, ... })` |
| ✅ Retrieve raw tick or OHLC data     | `getTicks('TSLA', timeRange)`                        |
| ✅ Provide time-windowed aggregations | `getOhlc('TSLA', '1h', timeRange)`                   |
| ✅ Detect price movement/anomalies    | `getDelta('BTCUSD', from, to)`                       |
| ✅ Enforce retention policies         | `cleanupOldData()` (or auto with policies)           |
| ✅ Provide current snapshot           | `getLatestPrice('ETHUSD')`                           |
| ✅ Provide strategy hooks             | `getVolatility('AAPL', lastNHours)`                  |
| ✅ Batch inserts for efficiency       | `insertManyOhlc([...])`, `insertManyTicks([...])`    |

---

## 🧪 **API Example (Deno / TypeScript)**

```ts
export interface PriceTick {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: string;
}

export interface Ohlc {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

class TimescaleClient {
  constructor(private pool: PostgresPool) {}

  async insertTick(tick: PriceTick): Promise<void> { ... }

  async insertOhlc(candle: Ohlc): Promise<void> { ... }

  async getOhlc(symbol: string, interval: '1m' | '1h', range: { from: Date, to: Date }): Promise<Ohlc[]> { ... }

  async getPriceDelta(symbol: string, from: Date, to: Date): Promise<number> { ... }

  async getLatestPrice(symbol: string): Promise<number | null> { ... }

  async getVolatility(symbol: string, hours: number): Promise<number> { ... }
}
```

You’d wrap raw SQL inside this class and provide business-facing accessors.

---

## 📦 Optional Features

* **LRU cache** for `getLatestPrice` to avoid frequent queries
* **Stream updates** to subscribers (via pub/sub or WebSocket)
* **Integrate OHLC rollup logic** if your streamer service ingests raw ticks

---

## 📁 Folder Structure Example

```text
tsdb-client/
├── src/
│   ├── mod.ts                     # Main export
│   ├── client.ts                  # Class wrapping all functionality
│   ├── schema/
│   │   ├── create_tables.sql      # Tick + OHLC schema
│   │   └── retention.sql          # Auto retention rules
│   └── queries/
│       ├── insert_tick.sql
│       ├── select_ohlc.sql
│       └── select_volatility.sql
└── types.ts                   
```

---

## Usage

```typescript
const delta = await timescaleClient.getPriceDelta('BTCUSD', article.publishedAt, article.publishedAt + 1hr);
```
