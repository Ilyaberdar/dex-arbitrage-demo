import Web3 from 'web3';
import { DexPriceFetcherBase } from './dexPriceFetcherBase.js';
import { AMM } from './types/amm-kinds.js';
import { ethers } from 'ethers';
import { logger } from '../utils/log.js';

import { UNISWAP_V2_POOL_ABI } from '../config/uniswapV2PoolABI.js';
import { ERC20_ABI } from '../config/erc20ABI.js';

/**
 * DexPriceFetcherV2
 * Fetches prices from Uniswap V2 style pools.
 */
class DexPriceFetcherV2 extends DexPriceFetcherBase {
  constructor(rpcUrl, poolAddress, token0, token1, fee) {
    super(AMM.V2),
    this.rpcUrl = rpcUrl;
    this.poolAddress = poolAddress;
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee || 0.003;
    this.web3 = new Web3(rpcUrl);
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Fetches current price and simulated price impact from a Uniswap V2 pool.
   * @param {string|bigint} [amountIn] - Amount of token0 to simulate a swap (optional)
   * @returns {Promise<object|null>} - Price data and pool state
   */
  async fetchV2PoolPrice() {
    try {
      const poolContract = new this.web3.eth.Contract(UNISWAP_V2_POOL_ABI, this.poolAddress);

      // Fetch token0 and token1 addresses from the pool
      const [poolToken0, poolToken1] = await Promise.all([
        poolContract.methods.token0().call(),
        poolContract.methods.token1().call()
      ]);

      // Fetch reserves of token0 and token1
      const reserves = await poolContract.methods.getReserves().call();
      const reserve0 = BigInt(reserves._reserve0);
      const reserve1 = BigInt(reserves._reserve1);

      // Fetch token decimals
      const [decimals0, decimals1] = await Promise.all([
        this.getTokenDecimals(poolToken0),
        this.getTokenDecimals(poolToken1)
      ]);

      let reserveIn, reserveOut;

      // Determine swap direction based on token order
      if (this.token0.toLowerCase() === poolToken0.toLowerCase() && this.token1.toLowerCase() === poolToken1.toLowerCase()) {
        reserveIn = reserve0;
        reserveOut = reserve1;
      } else if (this.token0.toLowerCase() === poolToken1.toLowerCase() && this.token1.toLowerCase() === poolToken0.toLowerCase()) {
        reserveIn = reserve1;
        reserveOut = reserve0;
      } else {
        throw new Error('Provided tokens do not match the pool tokens.');
      }

      const normalizedReserve0 = Number(reserve0) / (10 ** decimals0);
      const normalizedReserve1 = Number(reserve1) / (10 ** decimals1);

      const realPrice = normalizedReserve0 / normalizedReserve1;
      const blockNumber = await this.web3.eth.getBlockNumber();

      return {
        TokenBalance0: normalizedReserve0,
        TokenBalance1: normalizedReserve1,
        CurrentPrice: realPrice,
        CurrentBlock: blockNumber,
        TokenDecimals0: decimals0,
        TokenDecimals1: decimals1,
      };

    } catch (error) {
      logger.error(`[DexPriceFetcherV2]: Failed to fetch price from pool (${this.poolAddress}): ${error.message}`);
      return null;
    }
  }

  /**
 * Simulates price after a swap using Uniswap constant product formula.
 * @param {bigint} reserveIn - Current input reserve
 * @param {bigint} reserveOut - Current output reserve
 * @param {bigint} amountIn - Amount of tokenIn to simulate
 * @param {number} fee - Swap fee (e.g., 0.003 for 0.3%)
 * @returns {object} - New price, price impact, and amountOut
 */
simulatePriceAfterSwap(reserveIn, reserveOut, amountDecimal, tokenInDecimals, tokenOutDecimals, bRevert = false, bShowDebug = false) {
  //Some calculations here?

  // Price = reserveOut / reserveIn (out token per 1 in token)
  let priceBefore = normOutBefore / normInBefore;
  let priceAfter = normOutAfter / normInAfter;

  // If bRevert, invert to show price of input in output token (e.g. ETH per USDC)
  if (bRevert) {
    priceBefore = 1 / priceBefore;
    priceAfter = 1 / priceAfter;
  }

  const averagePrice = (priceBefore + priceAfter) / 2;
  const priceImpact = this.calculatePriceImpact(priceBefore, priceAfter);

  if (bShowDebug) {
    const label = !bRevert ? "PoolB" : "PoolC";
    logger.warn("*******V2*******");
    logger.info("Show debug for " + label);
    logger.info("AmountOut: " + amountOut.toString());
    logger.info("ReserveOutAfter: " + reserveOutAfter.toString());
    logger.info("PriceBefore: " + priceBefore);
    logger.info("PriceAfter: " + priceAfter);
    logger.info("AverageSellPrice : " + averagePrice);
    logger.info("PriceImpact: " + priceImpact);
  }

  return {
    priceBefore,
    priceAfter,
    averagePrice,
    priceImpact
  };
}

  async getCurrentEthPrice(poolAddress) {
    const currentPrice = await super.getPriceSqrt(poolAddress, this.provider, this.web3, this.token0, this.token1);
    return {
      CurrentPrice: currentPrice
    }
  }

  calculatePriceImpact(currentPrice, priceAfterSwap) {
    const impact = Math.abs(((priceAfterSwap / currentPrice) - 1) * 100);
    return impact.toFixed(6);
  }

  async getTokenDecimals(tokenAddress) {
    try {
      const token = new this.web3.eth.Contract(ERC20_ABI, tokenAddress);
      const decimals = await token.methods.decimals().call();
      return parseInt(decimals);
    } catch (err) {
      logger.error(`[DexPriceFetcherV2]: Failed to fetch decimals for token ${tokenAddress}: ${err.message}`);
      return 18; // fallback default
    }
  }
}

export { DexPriceFetcherV2 };
