// src/dex_simulator.rs
use crate::pools_abi::erc20_abi::ERC20;
use crate::pools_abi::uniswap_v3_liquidity::UniswapV3Liquidity;
use crate::pools_abi::uniswap_v3_slot0::UniswapV3Slot0;
use anyhow::Result;
use ethers::providers::{Http, Provider};
use ethers::types::{Address, U256};
use log::{info, warn};
use std::sync::Arc;

#[derive(Debug)]
pub struct SimResult {
    pub initial_price: String,
    pub final_price: String,
    pub average_sell_curve_price: String,
    pub usdc_amount_to_trade: String,
}

#[derive(Debug)]
pub struct PoolState {
    pub sqrt_price_x96: U256,
    pub liquidity: u128,
}

#[derive(Debug, Clone)]
pub struct SimulateTradeLoop {
    pub rpc_url: String,
    pub pool_address: String,
    pub token0: String,
    pub token1: String,
    pub fee: f64,
    pub ethers_provider: String,
    pub web3_provider: String,
}

impl SimulateTradeLoop {
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

    pub async fn simulate_swaps(
        &self,
        token_loan: f64,
        pool_label: u8,
        b_show_debug: bool,
    ) -> Result<SimResult> {
        let state = self.get_pool_state().await?;

        let token0_address: Address = self.token0.parse()?;
        let token1_address: Address = self.token1.parse()?;

        let decimals0 = self.get_token_decimals(&token0_address).await?;
        let decimals1 = self.get_token_decimals(&token1_address).await?;

        let sqrt_price_x96 = state.sqrt_price_x96;
        let liquidity = state.liquidity;

        info!(
            "simulate_swaps before| slot0() raw result = {:?}",
            sqrt_price_x96
        );

        if liquidity == 0 {
            anyhow::bail!("Pool has no liquidity");
        }

        if sqrt_price_x96.is_zero() {
            anyhow::bail!("Invalid sqrtPriceX96");
        }

        info!(
            "simulate_swaps after | slot0() raw result = {:?}",
            sqrt_price_x96
        );

        let result: SimResult = match pool_label {
            0 => {
                self.simulate_curve_price_movement(
                    sqrt_price_x96,
                    liquidity,
                    &token_loan,
                    decimals0.into(),
                    decimals1.into(),
                    false,
                    b_show_debug,
                )
                .await?
            }
            1 => {
                self.simulate_curve_price_movement(
                    sqrt_price_x96,
                    liquidity,
                    &token_loan,
                    decimals0.into(),
                    decimals1.into(),
                    true,
                    b_show_debug,
                )
                .await?
            }
            _ => anyhow::bail!("Invalid poolLabel: {}", pool_label),
        };

        Ok(result)
    }

    pub async fn simulate_curve_price_movement(
        &self,
        sqrt_price_x96: U256,
        liquidity: u128,
        amount_in_decimal: &f64,
        decimals0: u32,
        decimals1: u32,
        b_revert: bool,
        b_show_debug: bool,
    ) -> Result<SimResult> {
        info!("slot0() raw result = {:?}", sqrt_price_x96);

        if b_show_debug {
            info!("decimals0 = {}, decimals1 = {}", decimals0, decimals1);
            info!("decimal_diff = {}", decimal_diff);
            info!("decimal_factor = {}", decimal_factor);
        }

        let q96 = U256::from(2).pow(U256::from(96));
        let q192 = U256::from(2).pow(U256::from(192));

        let mut amount = *amount_in_decimal;
        if !b_revert {
            amount *= fee_multiplier;
        }

        let sqrt_p0 = sqrt_price_x96;
        let l = U256::from(liquidity);

        let scale = 10u128.pow(decimals0);
        let dx = U256::from((amount * scale as f64).round() as u128);

        if b_show_debug {
            info!("dx = amount * 10^decimals0 = {}", dx);
        }

        let dx_adj = dx.checked_mul(sqrt_p0).unwrap() / q96;

        let denominator = if !b_revert { l + dx_adj } else { l - dx_adj };

        if b_show_debug {
            info!(
                "denominator = l {} dx_adj = {}",
                if !b_revert { "+" } else { "-" },
                denominator
            );
        }

        let sqrt_p1 = l * sqrt_p0 / denominator;

        if b_show_debug {
            info!("sqrt_p1 = l * sqrt_p0 / denominator = {}", sqrt_p1);
        }

        let sqrt_p0_f64 = sqrt_p0.to_string().parse::<f64>()?;
        let sqrt_p1_f64 = sqrt_p1.to_string().parse::<f64>()?;
        let q192_f64 = q192.to_string().parse::<f64>()?;

        let price_before = sqrt_p0_f64 * sqrt_p0_f64 / q192_f64 * decimal_factor as f64;
        let price_after  = sqrt_p1_f64 * sqrt_p1_f64 / q192_f64 * decimal_factor as f64;

        if b_show_debug {
            info!(
                "initial_price = price_before_raw * decimal_factor = {:.6}",
                price_before
            );
            info!(
                "final_price = price_after_raw * decimal_factor = {:.6}",
                price_after
            );
        }

        let dy_usdc = dy.as_u128() as f64 / 10f64.powi(decimals1 as i32);
        let avg_price = dy_usdc / amount;

        if b_show_debug {
            info!("dy_usdc_decimal = dy / 10^decimals1 = {}", dy_usdc);
            info!(
                "avg_price_in_usdc = dy_usdc_decimal / amount = {}",
                avg_price
            );
        }

        let mut usdc_amount_to_trade = avg_price * amount;
        if b_revert {
            usdc_amount_to_trade *= fee_multiplier;
        }

        if b_show_debug {
            let label = if !b_revert { "PoolB" } else { "PoolC" };
            warn!("*******V3*******");
            info!("Show debug for {}", label);
            info!("PriceBeforeSwap: {:.2}", price_before);
            info!("PriceAfterSwap: {:.2}", price_after);
            info!("AverageCurveSellPrice: {:.2}", avg_price);
            info!("TotalGiveAmount: {:.2}", usdc_amount_to_trade);
        }

        Ok(SimResult {
            initial_price: format!("{:.6}", price_before),
            final_price: format!("{:.6}", price_after),
            average_sell_curve_price: format!("{:.2}", avg_price),
            usdc_amount_to_trade: format!("{:.2}", usdc_amount_to_trade),
        })
    }

    pub async fn get_pool_state(&self) -> Result<PoolState> {
        let provider = Provider::<Http>::try_from(self.rpc_url.clone())?;
        let client = Arc::new(provider);

        let address: Address = self.pool_address.parse()?;
        let pool_slot = UniswapV3Slot0::new(address, client.clone());
        let pool_liquidity = UniswapV3Liquidity::new(address, client);

        let (sqrt_price_x96, _, _, _, _, _, _) = pool_slot.slot_0().call().await?;
        let liquidity_raw = pool_liquidity.liquidity().call().await?;

        info!(
            "slot0() raw result = {:?}",
            pool_slot.slot_0().call().await?
        );

        Ok(PoolState {
            sqrt_price_x96: sqrt_price_x96,
            liquidity: liquidity_raw,
        })
    }

    pub async fn get_token_decimals(&self, token_address: &Address) -> Result<u8> {
        let provider = Provider::<Http>::try_from(self.rpc_url.clone())?;
        let client = Arc::new(provider);

        let token = ERC20::new(*token_address, client);

        match token.decimals().await {
            Ok(decimals) => Ok(decimals),
            Err(e) => {
                eprintln!(
                    "[SimulateTradeLoop]: Failed to fetch decimals for token {}: {}",
                    token_address, e
                );
                Ok(18)
            }
        }
    }
}
