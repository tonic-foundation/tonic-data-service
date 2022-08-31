declare type Event<T> = T & {
    created_at: string;
    receipt_id: string;
};
export declare type NewMarket = Event<{
    id: string;
}>;
export declare type NewOrder = Event<{
    id: string;
    market_id: string;
    user_id: string;
    limit_price: string;
    quantity: string;
    side: string;
    order_type: string;
}>;
export declare type NewFill = Event<{
    market_id: string;
    maker_order_id: string;
    maker_user_id: string;
    taker_order_id: string;
    taker_user_id: string;
    fill_qty: string;
    fill_price: string;
    fees: string;
    maker_rebate: string;
}>;
export declare type NewCancel = Event<{
    id: string;
    market_id: string;
    order_id: string;
    refund_amount: string;
    refund_token: string;
}>;
export {};
