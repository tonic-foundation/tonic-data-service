import { Axios } from 'axios';
import BN from 'bn.js';
/**
 * 24h price change stats
 */
export interface MarketStats {
    latest?: number;
    previous?: number;
    high?: number;
    low?: number;
    quantity: number;
}
export interface RecentTrade {
    price: BN;
    quantity: BN;
    timestamp: Date;
}
/**
 * A market for which the API supports charting/stats/history.
 */
export interface MarketInfo {
    id: string;
    symbol: string;
    base_token_id: string;
    quote_token_id: string;
    base_decimals: number;
    quote_decimals: number;
}
/**
 * An entry in a user's trade history
 */
export interface Trade {
    order_id: string;
    created_at: Date;
    quantity: number;
    price: number;
    direction: 'Buy' | 'Sell';
}
export interface Fill {
    created_at: Date;
    quantity: number | string;
    price: number | string;
}
export interface OrderStatus {
    /**
     * If true, the order is indexed, but the market isn't specifically supported
     * by the API. Prices and quantites will be returned in the raw on-string
     * representation (eg, 5 USDC will be returned as '5000000')
     */
    raw: boolean;
    order_id: string;
    market_id: string;
    created_at: Date;
    side: string;
    canceled: boolean;
    fills: Fill[];
}
declare const apiPrefix: {
    readonly 1: "api/v1";
};
export declare class TonicIndexer {
    readonly version: keyof typeof apiPrefix;
    _baseUrl: string;
    _client: Axios;
    constructor(baseUrl: string, version?: keyof typeof apiPrefix);
    /**
     * Return a market's latest trade price, latest trade price at least 24h
     * previous, and 24h high, low, and _base_ volume.
     */
    markets(): Promise<MarketInfo[]>;
    /**
     * Return list of tokens used in markets supported by the API.
     */
    tokens(): Promise<{
        id: string;
    }[]>;
    /**
     * Return a market's latest trade price, latest trade price at least 24h
     * previous, and 24h high, low, and base volume.
     */
    marketStats(market: string): Promise<MarketStats>;
    /**
     * Return recent trades by market ID.
     *
     * @param market market ID
     * @param limit max number of records to return
     * @param after optional time to fetch from
     */
    recentTrades(market: string, limit?: number, after?: Date): Promise<RecentTrade[]>;
    /**
     * Return an async generator of recent trades.
     *
     * @param market market ID
     * @param from optional time to prefill data from
     * @returns Trade stream as an asynv generator and a cancel function to stop streaming
     */
    recentTradeStream(market: string, from?: Date, _opts?: {
        batchSize: number;
        interval: number;
    }): [AsyncGenerator<RecentTrade>, () => unknown];
    /**
     * Return recent trades by market ID.
     *
     * @param market market ID
     * @param account account ID
     * @param limit max number of records to return
     * @param after optional timestamp to fetch from
     */
    tradeHistory(market: string, account: string, limit?: number, after?: Date): Promise<Trade[]>;
    getOrder(id: string): Promise<OrderStatus | null>;
}
export {};
