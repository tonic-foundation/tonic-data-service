import { Tonic } from '@tonic-foundation/tonic';
import { TonicIndexer } from '.';
export declare function getOrderInfo(tonic: Tonic, indexer: TonicIndexer, id: string): Promise<{
    openOrder: import("@tonic-foundation/tonic").OpenLimitOrder | null;
    raw: boolean;
    order_id: string;
    market_id: string;
    created_at: Date;
    side: string;
    canceled: boolean;
    fills: import(".").Fill[];
} | null>;
