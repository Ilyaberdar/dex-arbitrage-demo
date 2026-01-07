import Web3 from 'web3';
import { DexPriceFetcherBase } from './dexPriceFetcherBase.js';
import { AMM } from './types/amm-kinds.js';
import { ethers } from 'ethers';
import { logger } from '../utils/log.js';
import { performance } from 'perf_hooks';

import { ERC20_ABI } from '../config/erc20ABI.js';
import { UNISWAP_V3_POOL_ABI } from '../config/uniswapV3PoolABI.js';

import {
  Pool,
  Trade,
  Route,
  SwapQuoter,
  SwapRouter,
  TickMath,
} from '@uniswap/v3-sdk';

import {
  Token,
  CurrencyAmount,
  TradeType
} from '@uniswap/sdk-core';

import JSBI from 'jsbi';
import BigNumberPkg from 'bignumber.js';
const { BigNumber } = BigNumberPkg;
const BN = BigNumberPkg;

/**
 * DexPriceFetcherV3
 * Fetches prices from Uniswap V3 style pools.
 */
class DexPriceFetcherV3 extends DexPriceFetcherBase {
  constructor(rpcUrl, poolAddress, token0, token1, fee) {
    super(AMM.V3),
    this.rpcUrl = rpcUrl;
    this.poolAddress = poolAddress;
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee || 0.003;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.web3 = new Web3(rpcUrl);
  }

  async fetchV3PoolPrice(amountIn = null, bShowDebug = false) {
    try {
      // Where is the stuff...
      return {
        tokenBalance0: balance0,
        tokenBalance1: balance1,
        currentPrice: rawPrice,
        NormalizedPrice: normalizedPrice,
        PriceImpact: priceImpact
      };
    } catch (err) {
      logger.error(`[DexPriceFetcherV3]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
      return null;
    }
  }

  async simulatePriceImpact(balance0, balance1, amountInToken0, fee) {
    const newBalance0 = balance0.plus(amountInToken0.times(1 - fee));

    // Constant product: x * y = k => new y = k / new x
    const k = balance0.times(balance1);
    const newBalance1 = k.div(newBalance0);

    const priceAfter = newBalance1.div(newBalance0).toFixed(18);
    return priceAfter;
  }

  async simulateTradeLoop(TokenLoan, poolLabel, bShowDebug = false) {
    try {
      const state = await this.getPoolState();

      const decimals0 = await super.getTokenDecimals(this.token0, this.web3);
      const decimals1 = await super.getTokenDecimals(this.token1, this.web3);

      const sqrtPriceX96 = JSBI.BigInt(state.sqrtPriceX96.toString());
      const liquidity = JSBI.BigInt(state.liquidity.toString());
      const tick = Number(state.tick);

      if (JSBI.equal(liquidity, JSBI.BigInt(0))) {
        throw new Error('Pool has no liquidity');
      }
      if (JSBI.lessThanOrEqual(sqrtPriceX96, JSBI.BigInt(0))) {
        throw new Error('Invalid sqrtPriceX96');
      }
      if (!Number.isInteger(tick)) {
        throw new Error('Invalid tick');
      }

      /**
       * Simulation Strategy:
       * Take loan from pool A;
       * Swap Eth to stablecoin in pool B;
       *  - Calculate (initial price, final price, and average sell price by curve ) in this pool
       * Swap Stablecoin to Eth in pool C;
       *  - Calculate (initial price, final price, and average buy price by curve ) in this pool
       * Return loan and get profit
       */
      let simulate_pool_swap = 0;
      if (poolLabel === 0) {
        simulate_pool_swap = await this.simulateCurvePriceMovement(sqrtPriceX96, liquidity, TokenLoan, decimals0, decimals1, false, bShowDebug);
      } else if (poolLabel === 1) {
        simulate_pool_swap = await this.simulateCurvePriceMovement(sqrtPriceX96, liquidity, TokenLoan, decimals0, decimals1, true, bShowDebug);
      } else {
        logger.error("Invalid pool label")
      }
      const priceImpactPoolB = this.calculatePriceImpact(simulate_pool_swap.initialPrice, simulate_pool_swap.priceAfter);

      return {
        InitialPrice: simulate_pool_swap.initialPrice.toString(),
        FinalPrice: simulate_pool_swap.priceAfter.toString(),
        AverageCurvePrice: simulate_pool_swap.averageSellCurvePrice.toString(),
        TotalUsdc: simulate_pool_swap.USDCAmountToTrade.toString(),
        PriceImpact: priceImpactPoolB.toString(),
      };
    }
    catch (error) {
      logger.error(`[simulateTradeLoop] Error: ${error.message}`);
      throw error;
    }
  }

  /**
 * Simulates a swap of token0 → token1 on a Uniswap V3-like curve.
 *
 * This method calculates:
 *  - the final price (after impact) in token1 per token0,
 *  - and the average execution price across the entire curve during the swap.
 *
 * It uses the constant product curve mechanics of Uniswap V3:
 *   sqrtP1 = (L * sqrtP0) / (L - dx * sqrtP0 / Q96)
 *
 * And derives:
 *   - priceAfter: the new spot price after the swap (in token1 per token0),
 *   - avgExecutionPrice: the average price you effectively sold token0 for (based on amountOut / amountIn).
 *
 * Parameters:
 * @param {string|number|BigNumber} sqrtPriceX96 - Initial sqrt price (Q64.96 format)
 * @param {string|number|BigNumber} liquidity - Current pool liquidity
 * @param {number} amountInDecimal - Amount of token0 to sell (human-readable units, e.g. 200 ETH)
 * @param {number} decimals0 - Decimals of token0 (e.g. 18 for ETH)
 * @param {number} decimals1 - Decimals of token1 (e.g. 6 for USDC)
 *
 * Returns:
 * {
 *   priceAfter: string (new spot price after swap, adjusted for decimals),
 *   averageSellCurvePrice: string (effective average price per token0, in token1 units, e.g. USD)
 * }
 */
  async simulateCurvePriceMovement(sqrtPriceX96, liquidity, amountInDecimal, decimals0, decimals1, bRevert = false, bShowDebug = false) {
    BigNumber.config({ DECIMAL_PLACES: 100 });

    var dy = 0;
    var denominator = 0;
    const feeMultiplier = new BigNumber(1).minus(this.fee);

    if (!bRevert) {
      amountInDecimal *= feeMultiplier;
    }

    // 2. sqrt(P_after) = (L * sqrtP0) / (L + dx * sqrtP0)
    const dxAdj = dx.times(sqrtP0).div(Q96);

    if (!bRevert) {
      denominator = L.plus(dxAdj);
    } else {
      denominator = L.minus(dxAdj);
    }

    const sqrtP1 = L.times(sqrtP0).div(denominator);

    // 3. P_after = (sqrtP1^2 / Q192) * 10^(dec1 - dec0)
    const priceBeforeRaw = sqrtP0.pow(2).div(Q192);
    const priceAfterRaw = sqrtP1.pow(2).div(Q192);

    const initialPrice = priceBeforeRaw.times(decimalFactor);
    const finalPrice = priceAfterRaw.times(decimalFactor);

    if (bShowDebug) {
      const label = !bRevert ? "PoolB" : "PoolC";
      logger.warn("*******V3*******");
      logger.info("Show debug for " + label);
      logger.info("PriceBeforeSwap: " + initialPrice.toFixed(2));
      logger.info("PriceAfterSwap: " + finalPrice.toFixed(2));
      logger.info("AverageCurveSellPrice: " + avgPriceInUSDC.toFixed(2));
      logger.info("TotalGiveAmount: " + USDCAmountToTrade.toFixed(2));
    }

    return {
      initialPrice: initialPrice.toString(),
      priceAfter: finalPrice.toString(),
      averageSellCurvePrice: avgPriceInUSDC.toFixed(2),
      USDCAmountToTrade: USDCAmountToTrade
    };
  }

  async calculatePriceImpact(currentPrice, priceAfterSwap) {
    const impact = Math.abs(((priceAfterSwap / currentPrice) - 1) * 100);
    return impact.toFixed(6);
  }

  async getPoolState() {
    const pool = new ethers.Contract(this.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
    const [slot0, liquidityRaw] = await Promise.all([
      pool.slot0(),
      pool.liquidity()
    ]);

    return {
      sqrtPriceX96: slot0.sqrtPriceX96,
      tick: slot0.tick,
      liquidity: liquidityRaw
    };
  }

  getPriceFromTick(tick, decimals0, decimals1) {
    const tickNumber = typeof tick === 'bigint' ? Number(tick) : tick;
    const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tickNumber);
    const priceRaw = JSBI.toNumber(JSBI.multiply(sqrtPriceX96, sqrtPriceX96)) / 2 ** 192;
    const decimalFactor = 10 ** (decimals1 - decimals0);
    return priceRaw * decimalFactor;
  }
}

export { DexPriceFetcherV3 };

