use std::convert::TryInto;

use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::result::QueryResult;

use tonic_sdk::events;
use tonic_sdk::json::Base58VecU8;
use tonic_sdk::types::{OrderType, Side};

use crate::schema;
use crate::schema::*;

fn base58_encode(data: &Base58VecU8) -> String {
    bs58::encode(&data.0).into_string()
}

fn order_type_to_string(order_type: OrderType) -> String {
    use OrderType::*;
    match order_type {
        Limit => "limit",
        ImmediateOrCancel => "ioc",
        PostOnly => "postOnly",
        FillOrKill => "fillOrKill",
        Market => "market",
    }
    .to_string()
}

#[derive(Insertable)]
#[table_name = "cancel_event"]
pub struct NewCancelEvent {
    receipt_id: String,
    market_id: String,
    order_id: String,
    refund_amount: String,
    refund_token: String,
    cancelled_qty: String,
    created_at: NaiveDateTime,
    price_rank: i32,
}

pub fn save_new_cancel_event<'a>(
    conn: &PgConnection,
    receipt_id: String,
    created_at: NaiveDateTime,
    ev: events::NewCancelEvent,
) -> QueryResult<()> {
    let data: Vec<NewCancelEvent> = ev
        .cancels
        .iter()
        .map(|c| NewCancelEvent {
            receipt_id: receipt_id.clone(),
            market_id: base58_encode(&ev.market_id.into()),
            order_id: base58_encode(&c.order_id.into()),
            refund_amount: c.refund_amount.0.to_string(),
            refund_token: c.refund_token.key(),
            cancelled_qty: c.cancelled_qty.0.to_string(),
            price_rank: c.price_rank.0.try_into().expect("price rank overflow"),
            created_at,
        })
        .collect();

    diesel::insert_into(schema::cancel_event::table)
        .values(&data)
        .execute(conn)?;

    Ok(())
}

#[derive(Insertable)]
#[table_name = "fill_event"]
pub struct NewFillEvent {
    receipt_id: String,
    market_id: String,
    maker_order_id: String,
    taker_order_id: String,
    fill_qty: String,
    fill_price: String,
    quote_qty: String,
    maker_rebate: String,
    created_at: NaiveDateTime,
    /// Whether the taker order was a bid
    is_bid: bool,
    taker_account_id: String,
    maker_account_id: String,
    maker_price_rank: i32,
}

pub fn save_new_fill_event<'a>(
    conn: &PgConnection,
    receipt_id: String,
    created_at: NaiveDateTime,
    ev: events::NewFillEvent,
) -> QueryResult<()> {
    let taker_order_id = base58_encode(&ev.order_id.into());
    let data: Vec<NewFillEvent> = ev
        .fills
        .iter()
        .map(|f| NewFillEvent {
            receipt_id: receipt_id.clone(),
            market_id: base58_encode(&ev.market_id.into()),
            fill_price: f.fill_price.0.to_string(),
            fill_qty: f.fill_qty.0.to_string(),
            quote_qty: f.quote_qty.0.to_string(),
            maker_rebate: f.maker_rebate.0.to_string(),
            maker_order_id: base58_encode(&f.maker_order_id.into()),
            taker_order_id: taker_order_id.clone(),
            is_bid: f.side == Side::Buy,
            taker_account_id: f.taker_account_id.to_string(),
            maker_account_id: f.maker_account_id.to_string(),
            maker_price_rank: f
                .maker_price_rank
                .0
                .try_into()
                .expect("maker price rank overflow"),
            created_at,
        })
        .collect();

    diesel::insert_into(schema::fill_event::table)
        .values(&data)
        .execute(conn)?;

    Ok(())
}

#[derive(Insertable)]
#[table_name = "market_event"]
pub struct NewMarketEvent {
    receipt_id: String,
    market_id: String,
    base_token_id: String,
    quote_token_id: String,
    created_at: NaiveDateTime,
}

pub fn save_new_market_event<'a>(
    conn: &PgConnection,
    receipt_id: String,
    created_at: NaiveDateTime,
    ev: events::NewMarketEvent,
) -> QueryResult<()> {
    let data = NewMarketEvent {
        receipt_id,
        market_id: base58_encode(&ev.market_id.into()),
        base_token_id: ev.base_token.key(),
        quote_token_id: ev.quote_token.key(),
        created_at,
    };

    diesel::insert_into(schema::market_event::table)
        .values(&data)
        .execute(conn)?;

    Ok(())
}

#[derive(Insertable)]
#[table_name = "order_event"]
pub struct NewOrderEvent {
    account_id: String,
    receipt_id: String,
    order_id: String,
    market_id: String,
    limit_price: String,
    quantity: String,
    side: String,
    order_type: String,
    taker_fee: String,
    created_at: NaiveDateTime,
    referrer_id: Option<String>,
    referrer_rebate: String,
    is_swap: bool,
    /// Price rank of a newly posted order. -1 if the order didn't post.
    price_rank: i32,
}

pub fn save_new_order_event<'a>(
    conn: &PgConnection,
    receipt_id: String,
    created_at: NaiveDateTime,
    ev: events::NewOrderEvent,
) -> QueryResult<()> {
    let data = NewOrderEvent {
        receipt_id,
        account_id: ev.account_id.to_string(),
        order_id: base58_encode(&ev.order_id.into()),
        limit_price: ev.limit_price.0.to_string(),
        market_id: base58_encode(&ev.market_id.into()),
        order_type: order_type_to_string(ev.order_type),
        quantity: ev.quantity.0.to_string(),
        side: ev.side.to_string(),
        taker_fee: ev.taker_fee.0.to_string(),
        referrer_id: ev.referrer_id.map(|r| r.into()),
        referrer_rebate: ev.referrer_rebate.0.to_string(),
        created_at,
        is_swap: ev.is_swap,
        price_rank: ev
            .price_rank
            .map(|r| r.0.try_into().expect("price rank overflow"))
            .unwrap_or(-1),
    };

    diesel::insert_into(schema::order_event::table)
        .values(&data)
        .execute(conn)?;

    Ok(())
}

#[derive(Insertable)]
#[table_name = "indexer_processed_block"]
pub struct IndexerProcessedBlock {
    block_height: i32,
}

pub fn get_latest_processed_block<'a>(conn: &PgConnection) -> QueryResult<u64> {
    use schema::indexer_processed_block::dsl::*;
    let res = indexer_processed_block
        .order_by(block_height.desc())
        .select(block_height)
        .first::<i32>(conn);

    match res {
        Ok(latest) => Ok(latest as u64),
        Err(e) => match e {
            diesel::NotFound => Ok(0),
            _ => panic!("Error getting latest block {:?}", e),
        },
    }
}

pub fn save_latest_processed_block<'a>(conn: &PgConnection, block_height: u64) -> QueryResult<()> {
    diesel::insert_into(schema::indexer_processed_block::table)
        .values(&IndexerProcessedBlock {
            block_height: block_height as i32,
        })
        .execute(conn)?;

    Ok(())
}
