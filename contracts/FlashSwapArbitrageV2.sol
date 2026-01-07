// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

interface IUniswapV2Callee {
    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external;
}

contract FlashSwapArbitrageV2 is IUniswapV2Callee {
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    struct FlashParams {
        address initiator;
        address pool0;
        address pool1;
        address pool2;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bool zeroForOne;
    }

    function initiateFlashSwap(
        address pool0,
        address pool1,
        address pool2,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external {
        require(msg.sender == owner, "Only owner");

        (address token0, address token1) = (IUniswapV2Pair(pool0).token0(), IUniswapV2Pair(pool0).token1());
        bool zeroForOne = tokenIn == token0;

        uint amount0Out = zeroForOne ? amountIn : 0;
        uint amount1Out = zeroForOne ? 0 : amountIn;

        bytes memory data = abi.encode(
            FlashParams({
                initiator: msg.sender,
                pool0: pool0,
                pool1: pool1,
                pool2: pool2,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                zeroForOne: zeroForOne
            })
        );

        IUniswapV2Pair(pool0).swap(
            amount0Out,
            amount1Out,
            address(this),
            data
        );
    }

    function uniswapV2Call(
        address /* sender */,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external override {
        FlashParams memory params = abi.decode(data, (FlashParams));

        require(msg.sender == params.pool0, "Invalid callback");

        uint loanAmount = params.zeroForOne ? amount0 : amount1;

        // --- Step 1: Swap tokenIn → tokenOut on pool1 ---
        uint amountOut1 = _swap(
            params.pool1,
            params.tokenIn,
            params.tokenOut,
            loanAmount,
            params.zeroForOne
        );

        // --- Step 2: Swap tokenOut → tokenIn on pool2 ---
        uint amountOut2 = _swap(
            params.pool2,
            params.tokenOut,
            params.tokenIn,
            amountOut1,
            !params.zeroForOne
        );

        // --- Step 3: Repay flash loan ---
        uint fee = (loanAmount * 3) / 997 + 1;
        uint totalOwed = loanAmount + fee;

        require(amountOut2 > totalOwed, "Unprofitable");

        IERC20(params.tokenIn).transfer(params.pool0, totalOwed);

        // --- Step 4: Send profit ---
        uint profit = amountOut2 - totalOwed;
        IERC20(params.tokenIn).transfer(params.initiator, profit);
    }

    function _swap(
        address pair,
        address tokenIn,
        address tokenOut,
        uint amountIn,
        bool zeroForOne
    ) internal returns (uint amountOut) {
        IERC20(tokenIn).transfer(pair, amountIn);

        (uint reserve0, uint reserve1, ) = IUniswapV2Pair(pair).getReserves();
        (uint reserveIn, uint reserveOut) = zeroForOne ? (reserve0, reserve1) : (reserve1, reserve0);

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

        IUniswapV2Pair(pair).swap(
            zeroForOne ? 0 : amountOut,
            zeroForOne ? amountOut : 0,
            address(this),
            new bytes(0)
        );
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint) {
        uint amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function withdraw(address token) external {
        require(msg.sender == owner, "not owner");
        IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
    }

    receive() external payable {}
}
