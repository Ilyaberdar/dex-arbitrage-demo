use log::{error, info};
use crate::ArbitrageDirection;
use crate::threads::SimulateTradeLoopV2;
use ethers::types::U256;

pub async fn simulate_v2(
    dir: &ArbitrageDirection,
) -> Option<(String, String, f64, f64, f64)> {
    if dir.path.len() < 3 {
        error!("Direction path too short: {:?}", dir.path);
        return None;
    }

    let token_loan = 1.0f64;

    let pool_sell = &dir.path[1];
    let pool_buy = &dir.path[2];

    println!("pool_sell = {}", pool_sell);
    println!("pool_buy  = {}", pool_buy);

    println!("token0 = {}", &dir.token0);
    println!("token1  = {}", dir.token1);

    //TODO: Add correct fee from pool {maybe store this value in pools_to_arbitrage.json from JS core}
    let sim_sell = SimulateTradeLoopV2::new(&dir.provider, pool_sell, &dir.token0, &dir.token1, Some(0.003));
    let sim_buy = SimulateTradeLoopV2::new(&dir.provider, pool_buy, &dir.token0, &dir.token1, Some(0.003));

    let pool_b_res = match sim_sell.fetch_v2_pool_price().await {
        Ok(v) => {
            info!(
                            "pool_b_res: token_balance0={} token_balance1={} current_price={} decimals0={} decimals1={}",
                            v.token_balance0, v.token_balance1, v.current_price, v.token_decimals0, v.token_decimals1
                        );
            v
        }
        Err(e) => {
            error!("pool_b_res fetch failed: {e:#}");
            return None;
        }
    };

    let pool_c_res = match sim_buy.fetch_v2_pool_price().await {
        Ok(v) => {
            info!(
                            "pool_b_res: token_balance0={} token_balance1={} current_price={} decimals0={} decimals1={}",
                            v.token_balance0, v.token_balance1, v.current_price, v.token_decimals0, v.token_decimals1
                        );
            v
        }
        Err(e) => {
            error!("pool_b_res fetch failed: {e:#}");
            return None;
        }
    };

    let _reserve_b0 = U256::from(
        (pool_b_res.token_balance0 * 10f64.powi(pool_b_res.token_decimals0 as i32)) as u128,
    );

    let _reserve_b1 = U256::from(
        (pool_b_res.token_balance1 * 10f64.powi(pool_c_res.token_decimals1 as i32)) as u128,
    );

    let _reserve_c0 = U256::from(
        (pool_c_res.token_balance0 * 10f64.powi(pool_b_res.token_decimals0 as i32)) as u128,
    );

    let _reserve_c1 = U256::from(
        (pool_c_res.token_balance1 * 10f64.powi(pool_c_res.token_decimals1 as i32)) as u128,
    );

    let sell_res = sim_sell
        .simulate_price_after_swap(
            _reserve_b0,
            _reserve_b1,
            token_loan,
            pool_b_res.token_decimals0 as u32,
            pool_b_res.token_decimals1 as u32,
            false,
            true,
        )
        .await;

    // TODO: change amount in decimal value to sell_res.sell_result for example
    let buy_res = sim_buy
        .simulate_price_after_swap(
            _reserve_c1,
            _reserve_c0,
            token_loan,
            pool_c_res.token_decimals1 as u32,
            pool_c_res.token_decimals0 as u32,
            true,
            true,
        )
        .await;

    match (sell_res, buy_res) {
        (Ok(sell), Ok(buy)) => {
            let sell_price: f64 = sell.average_price;
            let buy_price: f64 = buy.average_price;
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