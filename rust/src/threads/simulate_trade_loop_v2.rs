use crate::pools_abi::erc20_abi::ERC20;
use crate::pools_abi::uniswap_v2_pair::UniswapV2Pair;
use ethers::providers::Middleware;

use ethers::providers::{Http, Provider};

use anyhow::{anyhow, Result};
use ethers::types::{Address, U256};
use log::{error, info, warn};
use std::sync::Arc;

#[derive(Debug)]
pub struct SimPriceResult {
    pub price_before: f64,
    pub price_after: f64,
    pub average_price: f64,
    pub price_impact: f64,
    pub amount_out: U256,
    pub reserve_out_after: U256,
}

pub struct SimulateTradeLoopV2 {
    pub rpc_url: String,
    pub pool_address: String,
    pub token0: String,
    pub token1: String,
    pub fee: f64,
    pub ethers_provider: String,
    pub web3_provider: String,
}

#[derive(Debug)]
pub struct PoolPriceResult {
    pub token_balance0: f64,
    pub token_balance1: f64,
    pub current_price: f64,
    pub token_decimals0: u8,
    pub token_decimals1: u8,
}

impl SimulateTradeLoopV2 {
    pub fn new(
        rpc_url: impl Into<String>,
        pool_address: impl Into<String>,
        token0: impl Into<String>,
        token1: impl Into<String>,
        fee: Option<f64>,
    ) -> Self {
        let rpc_url = rpc_url.into();
        Self {
            rpc_url: rpc_url.clone(),
            pool_address: pool_address.into(),
            token0: token0.into(),
            token1: token1.into(),
            fee: fee.unwrap_or(0.003),
            ethers_provider: format!("ethers::provider({})", rpc_url),
            web3_provider: format!("web3::provider({})", rpc_url),
        }
    }

    pub fn calculate_price_impact(price_before: f64, price_after: f64) -> f64 {
        if price_before == 0.0 {
            return 0.0;
        }
        ((price_before - price_after) / price_before).abs()
    }

    pub fn u256_to_f64(v: U256, decimals: u8) -> f64 {
        let scale = 10f64.powi(decimals as i32);
        let as_f64 = v.to_string().parse::<f64>().unwrap_or(0.0);
        as_f64 / scale
    }

    pub async fn fetch_v2_pool_price(&self) -> Result<PoolPriceResult> {
    let provider = Provider::<Http>::try_from(self.rpc_url.clone())?;
    let client = Arc::new(provider);
    let pool_addr: Address = self.pool_address.parse()?;

    let code = client.get_code(pool_addr, None).await?;
    if code.0.is_empty() {
        error!("No contract code at address {:?}", pool_addr);
        return Err(anyhow!("No contract deployed at address"));
    }

    // Fetch reserves?

    info!("Raw reserves: r0={} r1={}", reserve0, reserve1);
    info!("Pool tokens: token0={:?}, token1={:?}", pool_token0, pool_token1);
    info!("Config tokens: token0={:?}, token1={:?}", token0_addr, token1_addr);
    info!("Decimals: pool_token0={} pool_token1={}", pool_decimals0, pool_decimals1);

    // Match config tokens to pool tokens
    let (reserve_in, decimals_in, reserve_out, decimals_out) =
        if token0_addr == pool_token0 && token1_addr == pool_token1 {
            (reserve0, pool_decimals0, reserve1, pool_decimals1)
        } else if token0_addr == pool_token1 && token1_addr == pool_token0 {
            (reserve1, pool_decimals1, reserve0, pool_decimals0)
        } else {
            return Err(anyhow!(
                "Provided tokens do not match pool tokens (config: [{:?}, {:?}], pool: [{:?}, {:?}])",
                token0_addr, token1_addr, pool_token0, pool_token1
            ));
        };

    // Normalize reserves
    let normalized_reserve_in  = Self::u256_to_f64(reserve_in, decimals_in);
    let normalized_reserve_out = Self::u256_to_f64(reserve_out, decimals_out);
    let real_price = normalized_reserve_out / normalized_reserve_in;

    info!(
        "Normalized reserves: in={} (decimals={}), out={} (decimals={}), price={}",
        normalized_reserve_in,
        decimals_in,
        normalized_reserve_out,
        decimals_out,
        real_price
    );

    Ok(PoolPriceResult {
        token_balance0: normalized_reserve_in,
        token_balance1: normalized_reserve_out,
        current_price: real_price,
        token_decimals0: decimals_in,
        token_decimals1: decimals_out,
    })
}

    /// Simulates price after a swap using Uniswap constant product formula.
    #[allow(clippy::too_many_arguments)]
    pub async fn simulate_price_after_swap(
        &self,
        reserve_in: U256,
        reserve_out: U256,
        amount_decimal: f64,
        token_in_decimals: u32,
        token_out_decimals: u32,
        b_revert: bool,
        b_show_debug: bool,
    ) -> Result<SimPriceResult> {
        // fee math
        let fee_num = ((1.0 - self.fee) * 1000.0).floor() as u64;
        let fee_den = 1000u64;

        // Convert amountDecimal to on-chain amount
        let multiplier = 10u128.pow(token_in_decimals);
        let amount_in = U256::from((amount_decimal * multiplier as f64).floor() as u128);

        let fee_num_u256 = U256::from(fee_num);
        let fee_den_u256 = U256::from(fee_den);

        // amountInWithFee = amountIn * FEE_NUM
        // numerator = amountInWithFee * reserveOut
        // denominator = reserveIn * FEE_DEN + amountInWithFee

        let amount_out = numerator / denominator;

        let reserve_in_after = reserve_in + amount_in;
        let reserve_out_after = reserve_out - amount_out;

        // Normalize to decimals

        // Compute prices
        let mut price_before = normalized_reserve_out / normalized_reserve_in;
        let mut price_after = normalized_reserve_out_after / normalized_reserve_in_after;

        // Special case: USDC/ETH pool (invert)
        if token_out_decimals == 18 && token_in_decimals == 6 {
            price_before = 1.0 / price_before;
            price_after = 1.0 / price_after;
        }

        let average_price = (price_before + price_after) / 2.0;
        let price_impact = Self::calculate_price_impact(price_before, price_after);

        if b_show_debug {
            let label = if !b_revert { "PoolB" } else { "PoolC" };
            warn!("*******V2*******");
            info!("Show debug for {}", label);
            info!("AmountOut: {}", amount_out);
            info!("ReserveOutAfter: {}", reserve_out_after);
            info!("PriceBefore: {}", price_before);
            info!("PriceAfter: {}", price_after);
            info!("AverageSellPrice: {}", average_price);
            info!("PriceImpact: {}", price_impact);
        }

        Ok(SimPriceResult {
            price_before,
            price_after,
            average_price,
            price_impact,
            amount_out,
            reserve_out_after,
        })
    }
}
