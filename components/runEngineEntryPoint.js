import fs from 'fs';
import path from 'path';
import { DexPriceFetcherV3 } from './dexPriceFetcherV3.js';
import { DexPriceFetcherV2 } from './dexPriceFetcherV2.js';
import { initArbEngineCore } from './initArbEngineCore.js';

import { exportToJson } from './initArbEngineCore.js';
const profitablePathsPath = '../rust/pools_to_arbitrage.json'

import { TOKEN_ETH, TOKEN_ARB } from '../config/tokens.js';
import { ETH_NETWORK_POOL, ARB_NETWORK_POOL } from '../config/liquidityPool.js';

import { RPC } from '../config/rpcNetworks.js';
import { ethers } from "ethers";
import { logger } from '../utils/log.js';

import BigNumber from 'bignumber.js';

import * as wasm from '../perf_meter/pkg/perf_meter.js';
const perf = new wasm.PerfMeter();
const writeFileDestination = '../perf-viewer/src/perf_metrics.json'

const ShowDebug = true; // move to config

// ===============      UNISWAP V3 Pools       ==============
const FEE_UNISWAP_V3 = 0.0001; // move to config
const FEE_SUSHISWAP_V3 = 0.0005; // move to config
const LOAN_V3 = 1;

// Read from file
const poolsV3 = [
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.PANCAKESWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP_V3),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP_V3),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.SUSHISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_SUSHISWAP_V3),
];

// ===============      UNISWAP V2 Pools       ==============
const FEE_UNISWAP_V2 = 0.0001; // move to config
const FEE_SUSHISWAP_V2 = 0.0005; // move to config
const LOAN_V2 = 2400;

const poolsV2 = [
  new DexPriceFetcherV2(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_ETH_V2, TOKEN_ETH.WETH, TOKEN_ETH.USDC, FEE_UNISWAP_V2),
  new DexPriceFetcherV2(RPC.ETHEREUM, ETH_NETWORK_POOL.SUSHISWAP_ETH_V2, TOKEN_ETH.WETH, TOKEN_ETH.USDC, FEE_UNISWAP_V2),
  new DexPriceFetcherV2(RPC.ETHEREUM, ETH_NETWORK_POOL.PANCAKESWAP_ETH_V2, TOKEN_ETH.WETH, TOKEN_ETH.USDC, FEE_UNISWAP_V2),
];

async function mainV3() {
  try {
    const profitablePaths = await initArbEngineCore(poolsV3, LOAN_V3);
    await exportToJson(profitablePaths, profitablePathsPath);

  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

async function mainV2() {
  try {
    const profitablePaths = await initArbEngineCore(poolsV2, LOAN_V2);
    await exportToJson(profitablePaths, profitablePathsPath);

  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

export { mainV3, mainV2 };