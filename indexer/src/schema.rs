// @generated automatically by Diesel CLI.

diesel::table! {
    cancel_event (id) {
        id -> Int4,
        receipt_id -> Text,
        created_at -> Nullable<Timestamp>,
        market_id -> Text,
        order_id -> Text,
        refund_amount -> Text,
        refund_token -> Text,
        cancelled_qty -> Nullable<Text>,
        price_rank -> Nullable<Int4>,
    }
}

diesel::table! {
    fill_event (id) {
        id -> Int4,
        receipt_id -> Text,
        created_at -> Nullable<Timestamp>,
        market_id -> Text,
        maker_order_id -> Text,
        taker_order_id -> Text,
        fill_qty -> Text,
        fill_price -> Text,
        quote_qty -> Text,
        maker_rebate -> Text,
        is_bid -> Bool,
        taker_account_id -> Text,
        maker_account_id -> Text,
        maker_price_rank -> Nullable<Int4>,
    }
}

diesel::table! {
    indexer_processed_block (block_height) {
        block_height -> Int4,
        processed_at -> Nullable<Timestamp>,
    }
}

diesel::table! {
    market (id) {
        id -> Text,
        symbol -> Text,
        base_decimals -> Int2,
        quote_decimals -> Int2,
        base_token_id -> Nullable<Varchar>,
        quote_token_id -> Nullable<Varchar>,
        created_at -> Nullable<Timestamp>,
        base_lot_size -> Text,
        quote_lot_size -> Text,
        visible -> Nullable<Bool>,
    }
}

diesel::table! {
    market_event (id) {
        id -> Int4,
        receipt_id -> Text,
        created_at -> Nullable<Timestamp>,
        market_id -> Text,
        base_token_id -> Text,
        quote_token_id -> Text,
    }
}

diesel::table! {
    nep_141_token (id) {
        id -> Varchar,
        spec -> Nullable<Text>,
        name -> Text,
        symbol -> Text,
        decimals -> Int2,
        icon -> Nullable<Text>,
        reference -> Nullable<Text>,
        reference_hash -> Nullable<Text>,
        created_at -> Nullable<Timestamp>,
        stable -> Nullable<Bool>,
        visible -> Nullable<Bool>,
    }
}

diesel::table! {
    order_event (id) {
        id -> Int4,
        receipt_id -> Text,
        created_at -> Nullable<Timestamp>,
        order_id -> Text,
        market_id -> Text,
        limit_price -> Text,
        quantity -> Text,
        side -> Text,
        order_type -> Text,
        account_id -> Text,
        taker_fee -> Text,
        referrer_rebate -> Text,
        referrer_id -> Nullable<Text>,
        is_swap -> Nullable<Bool>,
        price_rank -> Nullable<Int4>,
        client_id -> Nullable<Int8>,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    cancel_event,
    fill_event,
    indexer_processed_block,
    market,
    market_event,
    nep_141_token,
    order_event,
);
