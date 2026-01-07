import { ethers } from 'ethers';
import { ERC20_ABI } from '../config/erc20ABI.js';
import { UNISWAP_V3_POOL_ABI } from '../config/uniswapV3PoolABI.js';
import { AMM } from './types/amm-kinds.js';
import { logger } from '../utils/log.js';

/**
 * DexPriceFetcherBase
 * Fetches prices from Uniswap style pools.
 */
class DexPriceFetcherBase {
  /** @param {'v2'|'v3'|'balancer'} kind */
  constructor(kind) {
    this.kind = kind;
   }

  // Begin Type Interface
  isV2() { return this.kind === AMM.V2; }
  isV3() { return this.kind === AMM.V3; }
  isBalancer() { return this.kind === AMM.BALANCER; }
  // End Type Interface

  /**
 * Fetches the normalized price from a Uniswap pools.
 *
 * Calculation explanation:
 * - `slot0().sqrtPriceX96` gives the square root of the price (token1/token0), scaled by 2^96 (Q96 fixed-point format).
 * - To obtain the real price, we square `sqrtPriceX96` and divide by 2^192.
 * - Then, the price is adjusted based on the decimal differences between token0 and token1.
 * - If the calculated price is extremely small (< 1e-6), it is inverted to maintain consistency.
 *
 * Final formula:
 *   price = (sqrtPriceX96^2) / 2^192
 *   price = price * (10^(decimals0 - decimals1))
 *   if (price < 1e-6) { price = 1 / price }
 *
 * @returns {Promise<number>} Normalized pool price (token1 per token0), adjusted for decimals
 */
  async getPriceSqrt(poolAddress, provider, web3, token0, token1, bShowDebug = false) {
    try {
      const pool = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);

      const [slot0, decimals0, decimals1] = await Promise.all([
        pool.slot0(),
        this.getTokenDecimals(token0, web3),
        this.getTokenDecimals(token1, web3)
      ]);

      var start = null;
      if (bShowDebug) {
        start = performance.now();
      }

      const sqrtPriceX96 = slot0.sqrtPriceX96;
      const priceX192 = sqrtPriceX96 * sqrtPriceX96;

      let price = Number(priceX192) / Number(2n ** 192n);
      price = price * (10 ** (decimals0 - decimals1))

      if (price < 1e-6) {
        price = 1 / price;
      }

      if (bShowDebug) {
        const end = performance.now();
        logger.info(`Execution time: ${(end - start).toFixed(2)} ms`);
      }

      return price;

    } catch (err) {
      logger.error(`[getV3PriceSqrt]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
      return null;
    }
  }

  async getTokenDecimals(tokenAddress, web3Provider) {
    try {
      const token = new web3Provider.eth.Contract(ERC20_ABI, tokenAddress);
      const decimals = await token.methods.decimals().call();
      return parseInt(decimals);
    } catch (err) {
      logger.error(`[DexPriceFetcherBase]: Failed to fetch decimals for token ${tokenAddress}: ${err.message}`);
      return 18; // fallback default
    }
  }
}

export { DexPriceFetcherBase };