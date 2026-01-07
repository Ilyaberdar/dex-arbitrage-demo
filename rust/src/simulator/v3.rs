use crate::ArbitrageDirection;
use crate::threads::SimulateTradeLoop;
use log::{info, error};

pub async fn simulate_v3(
    dir: &ArbitrageDirection,
) -> Option<(String, String, f64, f64, f64)> {
    if dir.path.len() < 3 {
        error!("Direction path too short: {:?}", dir.path);
        return None;
    }

    async fn simulate_on_pool(
        rpc: &str,
        pool_addr: &str,
        t0: &str,
        t1: &str,
        token_loan: f64,
        pool_label: u8,
    ) -> Result<crate::threads::SimResult, anyhow::Error> {
        let sim = SimulateTradeLoop::new(rpc, pool_addr, t0, t1, Some(0.003));
        sim.simulate_swaps(token_loan, pool_label, true).await
    }

    let token_loan = 1.0f64;

    let pool_sell = &dir.path[1];
    let pool_buy = &dir.path[2];

    log::info!("=== Direction ===");
    log::info!("Sell Pool: {:?}", pool_sell);
    log::info!("Buy  Pool: {:?}", pool_buy);

    let sell_res = simulate_on_pool(&dir.provider, pool_sell, &dir.token0, &dir.token1, token_loan, 0).await;
    let buy_res = simulate_on_pool(&dir.provider, pool_buy, &dir.token0, &dir.token1, token_loan, 1).await;

    match (sell_res, buy_res) {
        (Ok(sell), Ok(buy)) => {
            let sell_price: f64 = sell.final_price.parse::<f64>().ok()?;
            let buy_price = buy.final_price.parse::<f64>().ok()?;
            let spread = sell_price - buy_price;

            info!(
                            "OK: sell_pool={} buy_pool={} sell_final_price={:.9} buy_final_price={:.9} spread={:.9}",
                            pool_sell, pool_buy, sell_price, buy_price, spread
                        );

            Some((
                pool_sell.clone(),
                pool_buy.clone(),
                sell_price,
                buy_price,
                spread,
            ))
        }
        (Err(e), _) => {
            error!("sell sim failed on {}: {e:#}", pool_sell);
            None
        }
        (_, Err(e)) => {
            error!("buy sim failed on {}: {e:#}", pool_buy);
            None
        }
    }
}