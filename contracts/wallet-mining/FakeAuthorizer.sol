// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract FakeAuthorizer is UUPSUpgradeable {
    function destroy(address _addr) public {
        selfdestruct(payable(_addr));
    }
    function _authorizeUpgrade(address imp) internal override {}
}
