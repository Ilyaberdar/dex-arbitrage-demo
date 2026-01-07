mod pools_abi;
mod threads;
//mod context;
mod config;
mod simulator;

use anyhow::Result;
use bigdecimal::BigDecimal;
use env_logger::Builder;
use ethers::types::U256;
use futures::{stream, StreamExt};
use log::{error, info};
use serde::Deserialize;
use serde_json;
use std::path::Path;
use tokio::task;

use serde_json::from_reader;
use std::fs::File;
use std::io::BufReader;
use simulator::simulate_direction;

//use context::{Context as Ctx};
//use config::Config;

//use anyhow::Context as AnyhowContext;

#[derive(Debug, Deserialize)]
pub struct ArbitrageDirection {
    pub pool_type: String, // "V2" | "V3"
    pub token0: String,
    pub token1: String,
    pub path: Vec<String>,
    pub roi: f64,
    pub profit: f64,
    pub priceDifference: f64,
    pub pool_fee: f64,
    pub provider: String,
}

pub async fn load_directions<P: AsRef<std::path::Path>>(
    path: P,
) -> anyhow::Result<Vec<ArbitrageDirection>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let data: Vec<ArbitrageDirection> = from_reader(reader)?;
    Ok(data)
}

// === MAIN ===
#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() -> Result<()> {
    env_logger::Builder::from_default_env()
        .filter(None, log::LevelFilter::Info)
        .init();

    let directions = load_directions("rust/pools_to_arbitrage.json").await?;
    info!("Loaded {} directions", directions.len());
    let concurrency = directions.len();

    let results: Vec<_> = futures::stream::iter(directions)
        .map(|dir| {
            async move { simulate_direction(&dir).await }
        })
        .buffer_unordered(concurrency)
        .collect()
        .await;

    //let flat: Vec<_> = results.into_iter().flatten().collect();
    //let json = serde_json::to_string_pretty(&flat)?;
    //fs::write("sim_spreads.json", json).await?;
    //info!("Saved {} results to sim_spreads.json", flat.len());

    Ok(())
}


// ============================
// Gradient-based loan optimizer
// ============================
// This module finds the optimal `loan_amount` that maximizes the arbitrage profit:
// 
//     profit(loan) = (sell_price(loan) - buy_price(loan)) * loan - fees(loan)
//
// Where:
// - `sell_price(loan)` and `buy_price(loan)` are derived from on-chain pool simulation
// - `fees(loan)` can be estimated as loan * (fee_bps + gas_costs), etc.
//
// To find the loan that gives the highest profit, we use **gradient ascent**:
// 
//     x ← x + α · ∇f(x)
//
// with the gradient approximated numerically:
//
//     ∇f(x) ≈ (f(x + ε) - f(x - ε)) / (2·ε)
//
// ----------------------------
// Example usage:
//
// let (optimal_loan, max_profit) = gradient_ascent(
//     |l| profit_for_loan(l),
//     start = 1.0,
//     learning_rate = 0.5,
//     eps = 1e-4,
//     max_iters = 50,
// ).unwrap();
//
// Note:
// - Ensure `profit_for_loan()` is smooth (no jumps in swap sim)
// - This is a local optimizer — might not find global max if function has multiple peaks

fn numerical_gradient<F>(f: &F, x: f64, eps: f64) -> f64
where
    F: Fn(f64) -> f64,
{
    (f(x + eps) - f(x - eps)) / (2.0 * eps)
}

fn gradient_ascent<F>(
    f: F,
    start: f64,
    learning_rate: f64,
    eps: f64,
    max_iters: usize,
) -> Option<(f64, f64)>
where
    F: Fn(f64) -> f64,
{
    let mut x = start;
    let mut best_profit = f(x);
    let mut best_x = x;

    for _ in 0..max_iters {
        let grad = numerical_gradient(&f, x, eps);
        x += learning_rate * grad;

        if x < 0.0 {
            break; // loan can’t be negative
        }

        let p = f(x);
        if p > best_profit {
            best_profit = p;
            best_x = x;
        }

        // Stop if gradient small
        if grad.abs() < 1e-6 {
            break;
        }
    }

    if best_profit > 0.0 {
        Some((best_x, best_profit))
    } else {
        None
    }
}

/*fn profit_for_loan(loan: f64) -> f64 {
    // call simulate_price_after_swap for sell and buy
    // profit = (sell_price - buy_price) * loan - loan * fee

    let (optimal_loan, max_profit) = gradient_ascent(
    |l| profit_for_loan(l),
    start = 1.0,
    learning_rate = 0.5,
    eps = 1e-4,
    max_iters = 50,
).unwrap();
}*/