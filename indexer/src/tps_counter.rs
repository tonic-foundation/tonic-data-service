use chrono::{DateTime, Duration, Utc};
use tracing::info;

/// Basic DEX event counter. Note that when restarting the indexer, the stats
/// may appear artificially high as the indexer syncs up to head.
#[derive(Default)]
pub struct TpsCounter {
    lap_start: Option<DateTime<Utc>>,
    lap_count: u32,
}

impl TpsCounter {
    /// Start a new lap. Return the previous lap start, lap count, lap duration, and tps.
    pub fn lap(&mut self) -> (DateTime<Utc>, u32, Duration, f64) {
        let (prev_start, prev_count) = (self.lap_start.unwrap_or_else(Utc::now), self.lap_count);

        self.lap_start = Some(Utc::now());
        self.lap_count = 0;

        let elapsed = self.lap_start.unwrap() - prev_start;
        let tps = prev_count as f64 / elapsed.num_seconds() as f64;
        (prev_start, prev_count, elapsed, tps)
    }

    /// Add to the count. Return lap count after addition.
    pub fn add(&mut self, number: u32) -> u32 {
        self.lap_count += number;
        self.lap_count
    }
}

pub fn lap_and_log_tps(tps_counter: &mut TpsCounter) {
    let (start, count, elapsed, tps) = tps_counter.lap();

    let message = format!(
        "TPS since {}: {:.2} ({} total in {} seconds)",
        start,
        tps,
        count,
        elapsed.num_seconds()
    );

    info!(
        target: "tonic-tps",
        "{}",
        ansi_term::Colour::Cyan.bold().paint(message)
    );
}
