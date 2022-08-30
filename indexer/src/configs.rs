use clap::Parser;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[clap(
    version = "0.0.1",
    author = "Tonic Foundation <hello@tonic.foundation>"
)]
pub(crate) struct Opts {
    #[clap(subcommand)]
    pub subcmd: SubCommand,
}

#[derive(Parser, Debug)]
pub(crate) enum SubCommand {
    Run(RunConfigArgs),
}

#[derive(Parser, Debug)]
pub(crate) struct RunConfigArgs {
    /// contracts to watch for (comma-separated). Omit to process all contracts
    #[clap(long)]
    pub contract_ids: Option<Vec<String>>,

    #[clap(long)]
    pub from_blockheight: Option<u64>,
}

pub(crate) fn init_logging() {
    let env_filter = EnvFilter::new(
        "nearcore=info,tonic=info,tonic-tps=info,tokio_reactor=info,near=info,stats=info,telemetry=info,indexer=info,near-performance-metrics=info",
    );
    tracing_subscriber::fmt::Subscriber::builder()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .init();
}
