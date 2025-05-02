const { expect } = require("chai")
const { ethers } = require("hardhat")
const { time } = require("@nomicfoundation/hardhat-network-helpers")

describe("TheConclave Contract", function () {
  let theConclave
  let owner
  let addr1
  let addr2
  let addr3
  let addrs
  let deploymentFee = 5 // 5% fee

  beforeEach(async function () {
    // Get signers
    ;[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners()

    // Deploy contract
    const TheConclaveFactory = await ethers.getContractFactory("TheConclave")
    theConclave = await TheConclaveFactory.deploy(deploymentFee)
    await theConclave.waitForDeployment()

    // Open betting
    await theConclave.setOpen(true)
  })

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await theConclave.owner()).to.equal(owner.address)
    })

    it("Should set correct initial values", async function () {
      expect(await theConclave.fee()).to.equal(deploymentFee)
      expect(await theConclave.isOpen()).to.equal(true)
      expect(await theConclave.winner()).to.equal(0)
      expect(await theConclave.isDisputed()).to.equal(false)
      expect(await theConclave.paused()).to.equal(false)
      expect(await theConclave.bag()).to.equal(0)
      expect(await theConclave.totalPrizeClaimed()).to.equal(0)
      expect(await theConclave.minimumBet()).to.equal(333333333333333n)
      expect(await theConclave.maximumBet()).to.equal(ethers.parseEther("10"))
    })
  })

  describe("Owner Functions", function () {
    it("Should allow owner to change minimum bet amount", async function () {
      const newMinBet = ethers.parseEther("0.1")
      await theConclave.changeMinimumBetAmount(newMinBet)
      expect(await theConclave.minimumBet()).to.equal(newMinBet)
    })

    it("Should allow owner to change maximum bet amount", async function () {
      const newMaxBet = ethers.parseEther("20")
      await theConclave.changeMaximumBetAmount(newMaxBet)
      expect(await theConclave.maximumBet()).to.equal(newMaxBet)
    })

    it("Should allow owner to change fee", async function () {
      const newFee = 10
      await theConclave.changeFee(newFee)
      expect(await theConclave.fee()).to.equal(newFee)
    })

    it("Should allow owner to toggle betting status", async function () {
      await theConclave.setOpen(false)
      expect(await theConclave.isOpen()).to.equal(false)

      await theConclave.setOpen(true)
      expect(await theConclave.isOpen()).to.equal(true)
    })

    it("Should allow owner to change disputed status", async function () {
      await theConclave.changeDisputedStatus(true)
      expect(await theConclave.isDisputed()).to.equal(true)

      await theConclave.changeDisputedStatus(false)
      expect(await theConclave.isDisputed()).to.equal(false)
    })

    it("Should allow owner to toggle pause", async function () {
      await theConclave.togglePause()
      expect(await theConclave.paused()).to.equal(true)

      await theConclave.togglePause()
      expect(await theConclave.paused()).to.equal(false)
    })

    it("Should allow owner to transfer ownership", async function () {
      await theConclave.transferOwnership(addr1.address)
      expect(await theConclave.owner()).to.equal(addr1.address)
    })

    it("Should not allow non-owner to call owner functions", async function () {
      await expect(
        theConclave
          .connect(addr1)
          .changeMinimumBetAmount(ethers.parseEther("0.1"))
      ).to.be.revertedWith("Only owner can call this function")

      await expect(
        theConclave
          .connect(addr1)
          .changeMaximumBetAmount(ethers.parseEther("20"))
      ).to.be.revertedWith("Only owner can call this function")

      await expect(theConclave.connect(addr1).changeFee(10)).to.be.revertedWith(
        "Only owner can call this function"
      )

      await expect(
        theConclave.connect(addr1).setOpen(false)
      ).to.be.revertedWith("Only owner can call this function")

      await expect(
        theConclave.connect(addr1).changeDisputedStatus(true)
      ).to.be.revertedWith("Only owner can call this function")

      await expect(theConclave.connect(addr1).togglePause()).to.be.revertedWith(
        "Only owner can call this function"
      )

      await expect(
        theConclave.connect(addr1).transferOwnership(addr2.address)
      ).to.be.revertedWith("Only owner can call this function")
    })
  })

  describe("Betting", function () {
    it("Should allow users to place bets", async function () {
      const betAmount = ethers.parseEther("1")
      const popeId = 42

      await theConclave.connect(addr1).placeBet(popeId, { value: betAmount })

      const feeAmount = (betAmount * BigInt(deploymentFee)) / 100n
      const amountToBet = betAmount - feeAmount

      expect(await theConclave.getUserBet(addr1.address, popeId)).to.equal(
        amountToBet
      )
      expect(await theConclave.totalBetsByPopeId(popeId)).to.equal(amountToBet)
      expect(await theConclave.bag()).to.equal(amountToBet)
    })

    it("Should reject bets below minimum", async function () {
      const betAmount = ethers.parseEther("0.0001") // Too small
      await expect(
        theConclave.connect(addr1).placeBet(42, { value: betAmount })
      ).to.be.revertedWith("Bet amount below minimum")
    })

    it("Should reject bets above maximum", async function () {
      const betAmount = ethers.parseEther("11") // Too large
      await expect(
        theConclave.connect(addr1).placeBet(42, { value: betAmount })
      ).to.be.revertedWith("Bet amount above maximum")
    })

    it("Should reject bets with invalid pope IDs", async function () {
      const betAmount = ethers.parseEther("1")

      await expect(
        theConclave.connect(addr1).placeBet(0, { value: betAmount })
      ).to.be.revertedWith("Pope id must be between 1 and 135")

      await expect(
        theConclave.connect(addr1).placeBet(136, { value: betAmount })
      ).to.be.revertedWith("Pope id must be between 1 and 135")
    })

    it("Should reject bets when betting is closed", async function () {
      await theConclave.setOpen(false)

      const betAmount = ethers.parseEther("1")
      await expect(
        theConclave.connect(addr1).placeBet(42, { value: betAmount })
      ).to.be.revertedWith("Betting period is not open yet!")
    })

    it("Should reject bets when contract is paused", async function () {
      await theConclave.togglePause()

      const betAmount = ethers.parseEther("1")
      await expect(
        theConclave.connect(addr1).placeBet(42, { value: betAmount })
      ).to.be.revertedWith("Contract is paused")
    })
  })

  describe("Winner Selection", function () {
    it("Should allow owner to set winner", async function () {
      await theConclave.setOpen(false)
      const popeId = 42
      const timestamp = await time.latest()

      await theConclave.setWinner(popeId, timestamp)

      expect(await theConclave.winner()).to.equal(popeId)
    })

    it("Should not allow setting winner when betting is open", async function () {
      const timestamp = await time.latest()
      await expect(theConclave.setWinner(42, timestamp)).to.be.revertedWith(
        "Betting period is still open!"
      )
    })

    it("Should not allow setting winner twice", async function () {
      await theConclave.setOpen(false)
      const timestamp = await time.latest()

      await theConclave.setWinner(42, timestamp)

      await expect(theConclave.setWinner(43, timestamp)).to.be.revertedWith(
        "Winner already set"
      )
    })

    it("Should not allow setting winner with invalid pope ID", async function () {
      await theConclave.setOpen(false)
      const timestamp = await time.latest()

      await expect(theConclave.setWinner(0, timestamp)).to.be.revertedWith(
        "Pope id must be between 1 and 135"
      )

      await expect(theConclave.setWinner(136, timestamp)).to.be.revertedWith(
        "Pope id must be between 1 and 135"
      )
    })

    it("Should not allow setting winner with invalid timestamp", async function () {
      await theConclave.setOpen(false)
      const startTime = await theConclave.startTime()

      await expect(
        theConclave.setWinner(42, startTime - 1n)
      ).to.be.revertedWith("Cannot place winner on that timestamp")
    })
  })

  describe("Prize Redemption", function () {
    beforeEach(async function () {
      // Place bets from multiple users
      const betAmount = ethers.parseEther("1")
      const winningPopeId = 42
      const losingPopeId = 43

      await theConclave
        .connect(addr1)
        .placeBet(winningPopeId, { value: betAmount })
      await theConclave
        .connect(addr2)
        .placeBet(winningPopeId, { value: betAmount })
      await theConclave
        .connect(addr3)
        .placeBet(losingPopeId, { value: betAmount })

      // Close betting
      await theConclave.setOpen(false)

      // Set winner
      const timestamp = await time.latest()
      await theConclave.setWinner(winningPopeId, timestamp)

      // Mark as disputed (validated)
      await theConclave.changeDisputedStatus(true)
    })

    it("Should allow winners to redeem prizes", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address)

      // Redeem prize
      const tx = await theConclave.connect(addr1).redeemPrize()
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      // Calculate expected prize
      const feeAmount = (ethers.parseEther("1") * BigInt(deploymentFee)) / 100n
      const betAmount = ethers.parseEther("1") - feeAmount
      const totalBetAmount = betAmount * 2n // addr1 and addr2 bet on winning pope
      const expectedPrize = (betAmount * (betAmount * 3n)) / totalBetAmount

      // Check balance increase
      const finalBalance = await ethers.provider.getBalance(addr1.address)
      expect(finalBalance).to.be.closeTo(
        initialBalance + expectedPrize - gasUsed,
        ethers.parseEther("0.01") // Allow small difference due to gas price variations
      )

      // Verify claimed status
      expect(await theConclave.hasClaimed(addr1.address)).to.equal(true)
    })

    it("Should not allow non-winners to redeem prizes", async function () {
      await expect(theConclave.connect(addr3).redeemPrize()).to.be.revertedWith(
        "You didn't vote for the winning Pope"
      )
    })

    it("Should not allow double-claiming", async function () {
      await theConclave.connect(addr1).redeemPrize()

      await expect(theConclave.connect(addr1).redeemPrize()).to.be.revertedWith(
        "You have already claimed your prize"
      )
    })

    it("Should not allow redemption when contract is not disputed", async function () {
      await theConclave.changeDisputedStatus(false)

      await expect(theConclave.connect(addr1).redeemPrize()).to.be.revertedWith(
        "The contract has not been disputed yet"
      )
    })
  })

  describe("Dispute Functionality", function () {
    beforeEach(async function () {
      // Place bets
      const betAmount = ethers.parseEther("1")
      const popeId = 42

      await theConclave.connect(addr1).placeBet(popeId, { value: betAmount })

      // Close betting
      await theConclave.setOpen(false)

      // Set winner
      const timestamp = await time.latest()
      await theConclave.setWinner(popeId, timestamp)
    })

    it("Should allow owner to dispute votes", async function () {
      const feeAmount = (ethers.parseEther("1") * BigInt(deploymentFee)) / 100n
      const betAmount = ethers.parseEther("1") - feeAmount
      const disputeAmount = betAmount / 2n

      await theConclave.disputeVotes(addr1.address, disputeAmount, 42)

      expect(await theConclave.getUserBet(addr1.address, 42)).to.equal(
        betAmount - disputeAmount
      )
      expect(
        await theConclave.invalidUserVoteAmountForRefund(addr1.address)
      ).to.equal(disputeAmount)
      expect(await theConclave.bag()).to.equal(betAmount - disputeAmount)
    })

    it("Should allow users to refund disputed amounts", async function () {
      const feeAmount = (ethers.parseEther("1") * BigInt(deploymentFee)) / 100n
      const betAmount = ethers.parseEther("1") - feeAmount
      const disputeAmount = betAmount / 2n

      await theConclave.disputeVotes(addr1.address, disputeAmount, 42)
      await theConclave.changeDisputedStatus(true)

      const initialBalance = await ethers.provider.getBalance(addr1.address)

      // Refund disputed amount
      const tx = await theConclave.connect(addr1).refund()
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      // Check balance increase
      const finalBalance = await ethers.provider.getBalance(addr1.address)
      expect(finalBalance).to.be.closeTo(
        initialBalance + disputeAmount - gasUsed,
        ethers.parseEther("0.01") // Allow small difference due to gas price variations
      )

      // Verify refund was processed
      expect(
        await theConclave.invalidUserVoteAmountForRefund(addr1.address)
      ).to.equal(0)
    })
  })

  describe("Emergency Functions", function () {
    beforeEach(async function () {
      // Place bets
      const betAmount = ethers.parseEther("1")
      const popeId = 42

      await theConclave.connect(addr1).placeBet(popeId, { value: betAmount })

      // Close betting
      await theConclave.setOpen(false)

      // Set winner
      const timestamp = await time.latest()
      await theConclave.setWinner(popeId, timestamp)

      // Mark as disputed (validated)
      await theConclave.changeDisputedStatus(true)
    })

    it("Should allow owner to perform emergency withdraw", async function () {
      // Add extra ETH to contract (simulating unclaimed funds)
      await owner.sendTransaction({
        to: await theConclave.getAddress(),
        value: ethers.parseEther("2"),
      })

      const initialBalance = await ethers.provider.getBalance(owner.address)

      // Perform emergency withdraw
      const tx = await theConclave.emergencyWithdraw()
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      // Check balance increase
      const finalBalance = await ethers.provider.getBalance(owner.address)
      expect(finalBalance).to.be.closeTo(
        initialBalance + ethers.parseEther("2") - gasUsed,
        ethers.parseEther("0.01") // Allow small difference due to gas price variations
      )
    })

    it("Should allow owner to retrieve unclaimed funds after timeout", async function () {
      // Increase time to simulate passing of 180 days
      await time.increase(180 * 24 * 60 * 60 + 1)

      const initialBalance = await ethers.provider.getBalance(owner.address)

      // Retrieve unclaimed funds
      const tx = await theConclave.retrieveUnclaimedFunds(180 * 24 * 60 * 60)
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      // Check balance increase (account for gas)
      const finalBalance = await ethers.provider.getBalance(owner.address)
      const contractBalance = await ethers.provider.getBalance(
        await theConclave.getAddress()
      )

      expect(contractBalance).to.equal(0)
      expect(finalBalance).to.be.greaterThan(initialBalance - gasUsed)
    })
  })

  describe("Validation", function () {
    it("Should correctly validate distribution", async function () {
      // Initial state should be valid
      expect(await theConclave.validateDistribution()).to.equal(true)

      // Place bets
      const betAmount = ethers.parseEther("1")
      const popeId = 42

      await theConclave.connect(addr1).placeBet(popeId, { value: betAmount })

      // Close betting and set winner
      await theConclave.setOpen(false)
      const timestamp = await time.latest()
      await theConclave.setWinner(popeId, timestamp)

      // Mark as disputed (validated)
      await theConclave.changeDisputedStatus(true)

      // Distribution should still be valid
      expect(await theConclave.validateDistribution()).to.equal(true)

      // After prize redemption
      await theConclave.connect(addr1).redeemPrize()

      // Distribution should still be valid
      expect(await theConclave.validateDistribution()).to.equal(true)
    })
  })
})
