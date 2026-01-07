// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Mock version of Uniswap V3's ISwapRouter for testing purposes.
 * Simulates a 1:1 swap with no slippage or fees.
 */
abstract contract SwapRouterMock is ISwapRouter {
    address public token0;
    address public token1;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external override payable returns (uint256 amountOut) {
        // Mock: simply return same amount as output
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(msg.sender, params.amountIn); // simulate 1:1 swap
        return params.amountIn;
    }

    function exactInput(
        ExactInputParams calldata
    ) external override payable returns (uint256) {
        return 0;
    }

    function exactOutputSingle(
        ExactOutputSingleParams calldata
    ) external override payable returns (uint256) {
        return 0;
    }

    function exactOutput(
        ExactOutputParams calldata
    ) external override payable returns (uint256) {
        return 0;
    }
}
