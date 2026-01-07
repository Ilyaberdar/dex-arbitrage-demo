// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

event CallbackEntered(address pool0, address pool1, address pool2, address tokenIn, address tokenOut, uint256 amountIn);
event RemainingCheck(uint256 currentBalance, uint256 expectedMinimum);

contract FlashSwapArbitrageV3 {
    uint160 private constant MIN_SQRT_RATIO = 4295128739 + 1;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342 - 1;

    /**
     * @notice Entry point for the arbitrage with 3 pools
     * @param pool0 Uniswap V3 pool to borrow from (flashloan)
     * @param pool1 Pool to sell tokenIn for tokenOut
     * @param pool2 Pool to buy back tokenIn using tokenOut
     * @param tokenIn Token to borrow (and return at the end)
     * @param tokenOut Token used for intermediate step
     * @param amountIn Amount of tokenIn to borrow
     */
    function flashSwap(
        address pool0,
        address pool1,
        address pool2,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external {
        emit CallbackEntered(pool0, pool1, pool2, tokenIn, tokenOut, amountIn);

        // which token goes forward at the address
        bool zeroForOne = tokenIn < tokenOut;

        // price limit in this direction
        uint160 sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO;

        // Packs all parameters (initiator, pools, tokens, direction, amount) into bytes.
        // These bytes will be passed to swap() as a data argument, and inside Uniswap V3 they will be saved and passed to your uniswapV3SwapCallback().
        // This allows us to drag our data through Uniswap into the callback, because Uniswap itself doesn't know what to do with it.
        bytes memory data = abi.encode(
            msg.sender,
            pool0,
            pool1,
            pool2,
            tokenIn,
            tokenOut,
            amountIn,
            zeroForOne
        );

        // Call swap() with non-standard logic where:
        //  *  positive amountIn
        //  *  but there is no transfer of tokens to the pool in advance, as in a normal transaction
        //  *  so the pool is forced to call uniswapV3SwapCallback()
        // This is the start of swap without payment, which provokes a callback call.
        // And already there you have to pay back the debt, otherwise the transaction will rollback.
        IUniswapV3Pool(pool0).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96,
            data
        );
    }

    // is called because swap() passed non-empty data, and the pool didn't get paid immediately.
    function uniswapV3SwapCallback(
        int256 amount0,
        int256 amount1,
        bytes calldata data
    ) external {
        (
            address initiator,
            address pool0,
            address pool1,
            address pool2,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            bool zeroForOne
        ) = abi.decode(data, (address, address, address, address, address, address, uint256, bool));
        require(msg.sender == pool0, "Unauthorized callback");

        // ~ <ilya.berdar> update arbitrage loop [223803d0]
        uint256 tokenOutAmount = zeroForOne ? uint256(-amount1) : uint256(-amount0);

        // -------- Step 1: Sell tokenIn for tokenOut in pool1 --------
        IERC20(tokenIn).approve(pool1, amountIn);

        IUniswapV3Pool(pool1).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            ""
        );

        // -------- Step 2: Buy tokenIn back in pool2 using tokenOut --------
        IERC20(tokenOut).approve(pool2, tokenOutAmount);

        IUniswapV3Pool(pool2).swap(
            address(this),
            !zeroForOne, // reverse direction
            int256(tokenOutAmount),
            !zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            ""
        );

        // -------- Step 3: Repay the flashloan --------
        IERC20(tokenIn).transfer(pool0, amountIn);

        // -------- Step 4: Transfer profit to caller --------
        uint256 remaining = IERC20(tokenIn).balanceOf(address(this));
        require(remaining > amountIn, "No profit from arbitrage");

        uint256 profit = remaining - amountIn;
        IERC20(tokenIn).transfer(initiator, profit);
        // ~ <ilya.berdar>
    }
}
