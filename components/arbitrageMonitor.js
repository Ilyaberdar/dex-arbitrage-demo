// arbitrageMinitor.js
import { mainV2, mainV3 } from './runEngineEntryPoint.js';
import axios from 'axios';
import { logger } from '../utils/log.js';

const TELEGRAM_BOT_TOKEN = 'XXXXX';
const TELEGRAM_CHAT_ID = '01111';

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error(`Failed to send Telegram message: ${error.message}`);
  }
}

async function Tick() {
  while (true) {
    const start = Date.now();
    const resultV3 = await mainV3();
    if (resultV3?.ArbitrageProfitable) {
      const arbitrageResult = {
        PriceBeforeSwapPoolB: resultV3.PriceBeforeSwapPoolB,
        PriceBeforeSwapPoolC: resultV3.PriceBeforeSwapPoolC,
        PriceAfterSwapPoolB: resultV3.PriceAfterSwapPoolB,
        PriceAfterSwapPoolC: resultV3.PriceAfterSwapPoolC,
        AverageSellPrice: resultV3.AverageSellPrice,
        AverageBuyPrice: resultV3.AverageBuyPrice,
        PriceDifference: resultV3.PriceDifference,
        FinalAmountProfit: resultV3.FinalAmountProfit,
        FinalPercentageProfit: resultV3.FinalPercentageProfit,
        Loan: resultV3.Loan
      };
      const format = (num, digits = 4) => Number(num).toFixed(digits);

      const message = `🚨 *Arbitrage Opportunity Detected (V3)* 🚨

        💰 *Sell (Pool B)*
        • 📉 *Price Before:* \`${format(arbitrageResult.PriceBeforeSwapPoolB)}\`
        • 📈 *Price After:*  \`${format(arbitrageResult.PriceAfterSwapPoolB)}\`
        • 💵 *Average Sell Price:* \`${format(arbitrageResult.AverageSellPrice, 6)}\`

        🛒 *Buy (Pool C)*
        • 📉 *Price Before:* \`${format(arbitrageResult.PriceBeforeSwapPoolC)}\`
        • 📈 *Price After:*  \`${format(arbitrageResult.PriceAfterSwapPoolC)}\`
        • 💵 *Average Buy Price:* \`${format(arbitrageResult.AverageBuyPrice, 6)}\`

        📊 *Metrics*
        • 🔄 *Price Difference:* \`${format(arbitrageResult.PriceDifference, 6)}\`
        • 🧮 *Profit:* \`${format(arbitrageResult.FinalAmountProfit, 6)} USDC\`
        • 📈 *ROI:* \`${format(arbitrageResult.FinalPercentageProfit, 6)}%\`
        • 💼 *Loan Used:* \`${format(arbitrageResult.Loan, 0)} ETH\`
        • 🚀 *Executable:* ${arbitrageResult.FinalPercentageProfit > 0 ? '*Yes ✅*' : '*No ❌*'}
      `;

      sendTelegramMessage(message);
    }

    const resultV2 = await mainV2();
    if (resultV2?.ArbitrageProfitable) {
      const arbitrageResult = {
        SellOutPriceBefore: resultV2.SellOutPriceBefore,
        SellOutPriceAfter: resultV2.SellOutPriceAfter,
        SellOutAveragePrice: resultV2.SellOutAveragePrice,

        BuyInPriceBefore: resultV2.BuyInPriceBefore,
        BuyInPriceAfter: resultV2.BuyInPriceAfter,
        BuyInAveragePrice: resultV2.BuyInAveragePrice,

        PriceDifference: resultV2.PriceDifference,
        FinalAmountProfit: resultV2.FinalAmountProfit,
        Loan: resultV2.Loan
      };
      const format = (num, digits = 4) => Number(num).toFixed(digits);
      const message = `🚨 *Arbitrage Opportunity Detected (V2)* 🚨

        💰 *Sell (Pool B)*
        • 📉 *Price Before:* \`${format(arbitrageResult.SellOutPriceBefore)}\`
        • 📈 *Price After:*  \`${format(arbitrageResult.SellOutPriceAfter)}\`
        • 💵 *Average Sell Price:* \`${format(arbitrageResult.SellOutAveragePrice, 6)}\`

        🛒 *Buy (Pool C)*
        • 📉 *Price Before:* \`${format(arbitrageResult.BuyInPriceBefore)}\`
        • 📈 *Price After:*  \`${format(arbitrageResult.BuyInPriceAfter)}\`
        • 💵 *Average Buy Price:* \`${format(arbitrageResult.BuyInAveragePrice, 6)}\`

        📊 *Metrics*
        • 🔄 *Price Difference:* \`${format(arbitrageResult.PriceDifference, 6)}\`
        • 🧮 *Profit:* \`${format(arbitrageResult.FinalAmountProfit, 6)} USDC\`
        • 💼 *Loan Used:* \`${format(arbitrageResult.Loan, 0)} ETH\`
        • 🚀 *Executable:* ${arbitrageResult.FinalAmountProfit > 0 ? '*Yes ✅*' : '*No ❌*'}
        `;

      sendTelegramMessage(message);
    }

    const duration = Date.now() - start;
    const delay = Math.max(10000 - duration, 0);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

Tick();
