import fs from 'fs';
import f from 'fs/promises';
import path from 'path';
import BigNumber from 'bignumber.js';
import { ethers } from "ethers";
import JSBI from 'jsbi';

import { RPC } from '../config/rpcNetworks.js';

import { getLogger } from '../utils/log.js';
const engineLog = getLogger("engine");

import * as wasm from '../perf_meter/pkg/perf_meter.js';
const perf = new wasm.PerfMeter();
const writeFileDestination = '../perf-viewer/src/perf_metrics.json' // move to config

function getPairKey(token0, token1) {
    return [token0, token1].sort().join('-');
}

function groupPoolsByTokenPair(pools) {
    const map = new Map();
    for (const pool of pools) {
        const key = getPairKey(pool.token0, pool.token1);
        if (!map.has(key)) {
            map.set(key, { pools: [], _kinds: new Set() });
        }

        const entry = map.get(key);
        entry.pools.push(pool);
        entry._kinds.add(pool.kind);
    }

    for (const [key, entry] of map.entries()) {
        const kinds = Array.from(entry._kinds);
        let kind;
        if (kinds.length === 1) {
            kind = kinds[0];
        } else {
            kind = 'mixed';
        }
        delete entry._kinds;
        entry.kind = kind;
        map.set(key, entry);
    }

    return map;
}

function getValidTripletsFromGroups(grouped, { skipMixed = true } = {}) {
    const triplets = [];

    for (const [pair, entry] of grouped.entries()) {
        const { pools, kind } = entry;

        if (skipMixed && kind === 'mixed') {
            engineLog.debug(`Skipping pair ${pair} (mixed AMM kinds)`);
            continue;
        }

        const uniquePools = Array.from(new Map(pools.map(p => [p.poolAddress, p])).values());

        if (uniquePools.length < 3) {
            engineLog.debug(`Skipping pair ${pair} (only ${uniquePools.length} unique pools)`);
            continue;
        }

        engineLog.info(`Pair ${pair} (${kind}) has ${uniquePools.length} unique pools. Generating triplets...`);

        for (let i = 0; i < uniquePools.length - 2; i++) {
            for (let j = i + 1; j < uniquePools.length - 1; j++) {
                for (let k = j + 1; k < uniquePools.length; k++) {
                    triplets.push([uniquePools[i], uniquePools[j], uniquePools[k]]);
                }
            }
        }
    }

    return triplets;
}

function getPermutations([a, b, c]) {
    return [
        [a, b, c],
        [a, c, b],
        [b, a, c],
        [b, c, a],
        [c, a, b],
        [c, b, a],
    ];
}

async function simulateArbitrageLoopV3(poolA, poolB, poolC, loanAmount, debug = false) {
    //Some caclulations     
}

/**
 * @note: recheck calculations for valid output
 */
async function simulateArbitrageLoopV2(poolA, poolB, poolC, loanAmount, bDebug = false) {
    try {
        const poolARes = await poolA.fetchV2PoolPrice();
        const poolBRes = await poolB.fetchV2PoolPrice();
        const poolCRes = await poolC.fetchV2PoolPrice();

        // TODO: Check if first pool has available amount liquidity for loan
        const reserveA0 = BigInt(Math.floor(Number(poolARes.TokenBalance0) * 10 ** poolBRes.TokenDecimals0));
        const reserveA1 = BigInt(Math.floor(Number(poolARes.TokenBalance1) * 10 ** poolCRes.TokenDecimals1));

        const reserveB0 = BigInt(Math.floor(Number(poolBRes.TokenBalance0) * 10 ** poolBRes.TokenDecimals0));
        const reserveB1 = BigInt(Math.floor(Number(poolBRes.TokenBalance1) * 10 ** poolBRes.TokenDecimals1));

        const reserveC0 = BigInt(Math.floor(Number(poolCRes.TokenBalance0) * 10 ** poolCRes.TokenDecimals0));
        const reserveC1 = BigInt(Math.floor(Number(poolCRes.TokenBalance1) * 10 ** poolCRes.TokenDecimals1));

        // TODO: change amount in decimal value to sell_res.sell_result for example
        perf.start("SimulatePriceAfterSwapFor2Pools");
        const poolBV2Result = poolC.simulatePriceAfterSwap(reserveC1, reserveC0, loanAmount, poolCRes.TokenDecimals1, poolCRes.TokenDecimals0, false, bDebug);
        perf.stop("SimulatePriceAfterSwapFor2Pools");

        perf.start("SimulatePriceAfterSwapFor1Pools");
        const poolCV2Result = poolB.simulatePriceAfterSwap(reserveB0, reserveB1, loanAmount, poolBRes.TokenDecimals0, poolBRes.TokenDecimals1, true, bDebug);
        perf.stop("SimulatePriceAfterSwapFor1Pools");

        const tokenPrice = await getETHPriceFromUniswap();
        const gasPrice = await calculateGasPrice(tokenPrice);

        const sellOut = poolBV2Result;
        const buyIn = poolCV2Result;

        const totalFeePercent = (poolB.fee + poolC.fee) * 100;
        const amountDifference = sellOut.averagePrice - buyIn.averagePrice;
        const profit = amountDifference - gasPrice - totalFeePercent;

        const isArbitrageProfitable = profit > 0;
        const profitPercent = (amountDifference / (loanAmount * sellOut.priceBefore)) * 100;

        if (bDebug) {
            engineLog.warn("======== Debug Arbitrage Calculation ========");

            engineLog.info(`SellOut (PoolB):`);
            engineLog.info(`  └─ AveragePrice: ${sellOut?.averagePrice?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ priceBefore: ${sellOut?.priceBefore?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ priceAfter: ${sellOut?.priceAfter?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ PriceImpact: ${sellOut?.priceImpact ?? 'N/A'}%`);

            engineLog.info(`BuyIn (PoolC):`);
            engineLog.info(`  └─ AveragePrice: ${buyIn?.averagePrice?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ priceBefore: ${buyIn?.priceBefore?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ priceAfter: ${buyIn?.priceAfter?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`  └─ PriceImpact: ${buyIn?.priceImpact ?? 'N/A'}%`);

            engineLog.info(`Loan amount: ${loanAmount} (${typeof loanAmount})`);
            engineLog.info(`Gas cost (USD): ${gasPrice?.toFixed?.(8) ?? 'N/A'}`);
            engineLog.info(`Fees: Uniswap=${(poolB.fee * 100).toFixed(4)}%, Sushi=${(poolC.fee * 100).toFixed(4)}%`);
            engineLog.info(`Total fee percent: ${totalFeePercent.toFixed(4)}%`);
            engineLog.info(`Amount difference (sellOut - buyIn): ${amountDifference?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`Profit (USD): ${profit?.toFixed?.(6) ?? 'N/A'}`);

            const baseAmount = Number(loanAmount) * (sellOut?.priceBefore ?? 0);
            engineLog.info(`BaseAmount (loan * priceBefore): ${baseAmount?.toFixed?.(6) ?? 'N/A'}`);
            engineLog.info(`Profit Percent (ROI): ${profitPercent?.toFixed?.(4) ?? 'N/A'}%`);
            engineLog.info(`Is arbitrage profitable?: ${isArbitrageProfitable}`);

            engineLog.warn("=============================================");

            engineLog.warn("Write perf metrics");
            const perf_json = perf.export_json();
            const str = JSON.stringify(perf_json);
            fs.writeFileSync(writeFileDestination, str);
        }

        return {
            token0: poolA.token0,
            token1: poolA.token1,
            priceDifference: amountDifference,
            profit: profit,
            roi: profitPercent,
            isProfitable: isArbitrageProfitable,
            total_fee: poolB.fee + poolC.fee,
            path: [poolA.poolAddress, poolB.poolAddress, poolC.poolAddress],
        };
    } catch (err) {
        engineLog.error(`Simulation error: ${err.message}`);
        return null;
    }
}

async function simulateArbitrageLoopBalancer(pools, loanAmount, bDebug = false) {
    //TODO: Implement in fufture
}

async function calculateGasPrice(tokenPrice) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC.ARBITRUM);
        const gasPriceWei = await provider.send("eth_gasPrice", []);
        const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
        const gasLimit = 250000; // by default
        const gasCostUSDC = new BigNumber(gasPriceGwei).times(gasLimit).times(tokenPrice).div(1e9);

        return gasCostUSDC;
    }
    catch (error) {
        logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
        throw error;
    }
}

async function calculateLoanFeeV3(loanAmount, tokenPrice) {
    try {
        const flashLoanFeeRate = 0.0009; // move to config
        const flashLoanFeeETH = new BigNumber(loanAmount).times(flashLoanFeeRate);
        const flashLoanFeeUSDC = flashLoanFeeETH.times(tokenPrice);

        return flashLoanFeeUSDC;
    }
    catch (error) {
        logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
        throw error;
    }
}

export async function initArbEngineCore(pools, loanAmount) {
    try {
        engineLog.info('Grouping pools by token pairs...');
        const grouped = groupPoolsByTokenPair(pools);

        let poolsKind = new Set();

        for (const [key, entry] of grouped.entries()) {
            if (entry.kind === 'mixed') {
                engineLog.warn('Founded mixed pools. Skip triplet...');
                return null;
            }

            poolsKind.add(entry.kind);
        }

        engineLog.info(`Grouped into ${grouped.size} unique token pairs`);

        const triplets = getValidTripletsFromGroups(grouped);
        engineLog.info(`Generated ${triplets.length} valid triplets`);

        const finalResults = [];

        engineLog.info('Run V3 best profitable arbitrage paths...');

        // OOOOOPS, I loose some code here

        if (finalResults.length === 0) {
            engineLog.info('No profitable arbitrage paths found.');
            return [];
        }

        const sorted = finalResults.sort((a, b) => b.profit.minus(a.profit));
        const top = sorted[0];

        engineLog.info(`Best arbitrage → Profit: ${top.profit.toFixed(6)} | ROI: ${top.roi.toFixed(2)}% | Path: ${top.path.join(' → ')}`);

        return sorted;
    }
    catch (error) {
        logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
        throw error;
    }
}

export async function exportToJson(results, filePath) {
    const simplified = results.map(res => ({
        pool_type: res.pool_type,
        token0: res.token0,
        token1: res.token1,
        path: res.path,
        roi: Number(res.roi),
        profit: Number(res.profit),
        priceDifference: Number(res.priceDifference),
        pool_fee: Number(res.pool_fee),
        provider: res.provider,
    }));

    let prev = [];
    try {
        prev = JSON.parse(await f.readFile(filePath, 'utf8'));
    } catch {}

    const combined = [...prev, ...simplified];
    await f.writeFile(filePath, JSON.stringify(combined, null, 2));

    engineLog.info(`Exported ${simplified.length} route(s) to ${path.resolve(filePath)}`);
}

/**
 * @note: Default hardcoded pool for current ETH price
 */
async function getETHPriceFromUniswap() {
    //XD
}