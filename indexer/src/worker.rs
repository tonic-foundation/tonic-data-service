use diesel::{Connection, PgConnection};
use rand::Rng;
use std::convert::TryInto;

use chrono::NaiveDateTime;
use near_lake_framework::near_indexer_primitives::views::{
    ExecutionStatusView, ReceiptEnumView, ReceiptView,
};
use near_lake_framework::near_indexer_primitives::IndexerExecutionOutcomeWithReceipt;
use tracing::{error, info};

use tonic_sdk::events::{Event as DexEvent, EventType as DexEventType};

use crate::constants::TARGET;
use crate::db::PgPool;
use crate::event;
use crate::models::{self, save_latest_processed_block};

pub struct Worker {
    contract_ids: Option<Vec<String>>,
    db_pool: PgPool,
}

impl Worker {
    pub fn new(contract_ids: Option<Vec<String>>, db_pool: PgPool) -> Self {
        Self {
            contract_ids,
            db_pool,
        }
    }
}

impl Worker {
    pub async fn process_message(
        &self,
        streamer_message: near_lake_framework::near_indexer_primitives::StreamerMessage,
    ) {
        let conn = self.db_pool.get().expect("Unable to get connection");
        let block_height = streamer_message.block.header.height;

        // process each block as a transaction
        let res = conn.transaction::<_, diesel::result::Error, _>(|| {
            for shard in streamer_message.shards {
                for o in shard.receipt_execution_outcomes {
                    if self.should_save(&o) {
                        let block_timestamp_ns = streamer_message.block.header.timestamp_nanosec;
                        save_execution_outcome(&conn, o, block_timestamp_ns)?;
                    }
                }
            }
            // unique constraint on block number will roll back (ie, skip) dupes
            save_latest_processed_block(&conn, block_height)?;

            Ok(())
        });

        if let Err(e) = res {
            error!(
                target: TARGET,
                "Error saving block {}, {:?}", block_height, e
            );
        }
    }

    pub fn should_save(&self, o: &IndexerExecutionOutcomeWithReceipt) -> bool {
        if matches!(
            o.execution_outcome.outcome.status,
            ExecutionStatusView::Unknown | ExecutionStatusView::Failure(_)
        ) {
            return false;
        }
        if o.execution_outcome.outcome.logs.is_empty() {
            return false;
        }
        match &self.contract_ids {
            Some(contracts_to_watch) => {
                let contract_id: String = o.receipt.receiver_id.to_string();
                contracts_to_watch.contains(&contract_id)
            }
            None => true,
        }
    }
}

fn save_execution_outcome(
    conn: &PgConnection,
    o: IndexerExecutionOutcomeWithReceipt,
    block_timestamp_ns: u64,
) -> diesel::result::QueryResult<()> {
    for log in o.execution_outcome.outcome.logs {
        if !event::is_event_log(&log) {
            continue;
        }
        if let Ok(ev) = event::parse_dex_event(&log) {
            save_event(conn, ev, &o.receipt, block_timestamp_ns)?
        }
    }

    Ok(())
}

fn save_event(
    conn: &PgConnection,
    ev: DexEvent,
    receipt: &ReceiptView,
    block_timestamp_ns: u64,
) -> diesel::result::QueryResult<()> {
    use models::*;

    if !matches!(receipt.receipt, ReceiptEnumView::Action { .. }) {
        return Ok(());
    }

    let receipt_id = receipt.receipt_id.to_string();
    let (timestamp_ms, excess_ns) = (
        block_timestamp_ns / 1_000_000_000,
        block_timestamp_ns % 1_000_000_000,
    );
    let timestamp = NaiveDateTime::from_timestamp(
        timestamp_ms.try_into().unwrap(),
        excess_ns.try_into().unwrap(),
    );

    let now = std::time::Instant::now();
    match ev.data {
        DexEventType::NewMarket(ev) => save_new_market_event(&conn, receipt_id, timestamp, ev)?,
        DexEventType::Order(ev) => save_new_order_event(&conn, receipt_id, timestamp, ev)?,
        DexEventType::Fill(ev) => save_new_fill_event(&conn, receipt_id, timestamp, ev)?,
        DexEventType::Cancel(ev) => save_new_cancel_event(&conn, receipt_id, timestamp, ev)?,
    };
    // log 1% of events
    let mut rng = rand::thread_rng();
    if rng.gen_range(0.0..1.0) < 0.01 {
        let elapsed = now.elapsed();
        info!(target: TARGET, "Wrote event in {:.2?}", elapsed);
    }

    Ok(())
}
