require("@nomicfoundation/hardhat-toolbox")

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    aleacoNetwork: {
      url: "http://192.168.100.45:8545",
    },
  },
}
