const { expect } = require("chai")
const { ethers } = require("hardhat")
const { time } = require("@nomicfoundation/hardhat-network-helpers")

describe("TheConclave", function () {
  let TheConclave
  let conclave
  let owner
  let addr1
  let addr2
  let addrs

  const FEE = 5n // 5% fee
  const MIN_BET = ethers.parseEther("0.000333333333333333") // in wei

  beforeEach(async function () {
    // Get the ContractFactory and Signers
    TheConclave = await ethers.getContractFactory("TheConclave")
    ;[owner, addr1, addr2, ...addrs] = await ethers.getSigners()

    // Deploy the contract
    conclave = await TheConclave.deploy(FEE)
    await conclave.waitForDeployment()
  })

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await conclave.owner()).to.equal(owner.address)
    })

    it("Should set the correct initial values", async function () {
      expect(await conclave.bag()).to.equal(0n)
      expect(await conclave.minimumBet()).to.equal(MIN_BET)
      expect(await conclave.fee()).to.equal(FEE)
      expect(await conclave.isOpen()).to.equal(false)
      expect(await conclave.winner()).to.equal(0n)
      expect(await conclave.totalPrizeClaimed()).to.equal(0n)
    })
  })

  describe("Owner functions", function () {
    it("Should allow owner to change minimum bet amount", async function () {
      const newMinBet = ethers.parseEther("0.001")
      await conclave.changeMinimumBetAmount(newMinBet)
      expect(await conclave.minimumBet()).to.equal(newMinBet)
    })

    it("Should emit MinimumBetChanged event when minimum bet is changed", async function () {
      const newMinBet = ethers.parseEther("0.001")
      await expect(conclave.changeMinimumBetAmount(newMinBet))
        .to.emit(conclave, "MinimumBetChanged")
        .withArgs(newMinBet)
    })

    it("Should allow owner to change fee", async function () {
      const newFee = 10n // 10%
      await conclave.changeFee(newFee)
      expect(await conclave.fee()).to.equal(newFee)
    })

    it("Should emit FeeChanged event when fee is changed", async function () {
      const newFee = 10n
      await expect(conclave.changeFee(newFee))
        .to.emit(conclave, "FeeChanged")
        .withArgs(newFee)
    })

    it("Should not allow fee to be set to 0 or greater than 100", async function () {
      await expect(conclave.changeFee(0n)).to.be.revertedWith(
        "Fee must be between 1 and 100"
      )
      await expect(conclave.changeFee(101n)).to.be.revertedWith(
        "Fee must be between 1 and 100"
      )
    })

    it("Should allow owner to open betting", async function () {
      await conclave.setOpen(true)
      expect(await conclave.isOpen()).to.equal(true)
    })

    it("Should emit BettingStatusChanged event when betting status is changed", async function () {
      await expect(conclave.setOpen(true))
        .to.emit(conclave, "BettingStatusChanged")
        .withArgs(true)
    })

    it("Should allow owner to close betting", async function () {
      await conclave.setOpen(true)
      await conclave.setOpen(false)
      expect(await conclave.isOpen()).to.equal(false)
    })

    it("Should allow owner to set winner", async function () {
      // First close betting
      await conclave.setOpen(false)
      const popeId = 42n
      await conclave.setWinner(popeId)
      expect(await conclave.winner()).to.equal(popeId)
    })

    it("Should emit WinnerSet event when winner is set", async function () {
      await conclave.setOpen(false)
      const popeId = 42n
      await expect(conclave.setWinner(popeId))
        .to.emit(conclave, "WinnerSet")
        .withArgs(popeId)
    })

    it("Should not allow setting winner when betting is open", async function () {
      await conclave.setOpen(true)
      await expect(conclave.setWinner(42n)).to.be.revertedWith(
        "Betting period is still open!"
      )
    })

    it("Should not allow setting invalid pope IDs", async function () {
      await conclave.setOpen(false)
      await expect(conclave.setWinner(0n)).to.be.revertedWith(
        "Pope id must be between 1 and 135"
      )
      await expect(conclave.setWinner(136n)).to.be.revertedWith(
        "Pope id must be between 1 and 135"
      )
    })
  })

  describe("Betting functions", function () {
    beforeEach(async function () {
      // Open betting for these tests
      await conclave.setOpen(true)
    })

    it("Should allow users to place bets", async function () {
      const betAmount = ethers.parseEther("1")
      const popeId = 42n
      await conclave.connect(addr1).placeBet(popeId, { value: betAmount })

      // Calculate expected values
      const feeAmount = (betAmount * FEE) / 100n
      const amountToBet = betAmount - feeAmount

      // Check recorded bet amounts
      const userBet = await conclave.getUserBet(addr1.address, popeId)
      const totalBets = await conclave.totalBetsByPopeId(popeId)
      const bagAmount = await conclave.bag()

      expect(userBet).to.equal(amountToBet)
      expect(totalBets).to.equal(amountToBet)
      expect(bagAmount).to.equal(amountToBet)
    })

    it("Should emit BetPlaced event when a bet is placed", async function () {
      const betAmount = ethers.parseEther("1")
      const popeId = 42n

      // Calculate expected values
      const feeAmount = (betAmount * FEE) / 100n
      const amountToBet = betAmount - feeAmount

      await expect(
        conclave.connect(addr1).placeBet(popeId, { value: betAmount })
      )
        .to.emit(conclave, "BetPlaced")
        .withArgs(addr1.address, popeId, amountToBet)
    })

    it("Should reject bets below minimum", async function () {
      const belowMinBet = ethers.parseEther("0.0001")
      await expect(
        conclave.connect(addr1).placeBet(42n, { value: belowMinBet })
      ).to.be.revertedWith("Bet amount below minimum")
    })

    it("Should not allow betting on invalid pope IDs", async function () {
      const betAmount = ethers.parseEther("1")
      await expect(
        conclave.connect(addr1).placeBet(0n, { value: betAmount })
      ).to.be.revertedWith("Pope id must be between 1 and 135")
      await expect(
        conclave.connect(addr1).placeBet(136n, { value: betAmount })
      ).to.be.revertedWith("Pope id must be between 1 and 135")
    })

    it("Should not allow betting when betting is closed", async function () {
      await conclave.setOpen(false)
      const betAmount = ethers.parseEther("1")
      await expect(
        conclave.connect(addr1).placeBet(42n, { value: betAmount })
      ).to.be.revertedWith("Betting period is not open yet!")
    })

    it("Should transfer fee to owner", async function () {
      const betAmount = ethers.parseEther("1")
      const popeId = 42n

      // Calculate fee amount
      const feeAmount = (betAmount * FEE) / 100n

      // Check owner balance change
      const ownerInitialBalance = await ethers.provider.getBalance(
        owner.address
      )
      const tx = await conclave
        .connect(addr1)
        .placeBet(popeId, { value: betAmount })
      const receipt = await tx.wait()
      const ownerFinalBalance = await ethers.provider.getBalance(owner.address)

      expect(ownerFinalBalance - ownerInitialBalance).to.equal(feeAmount)
    })
  })

  describe("Prize redemption", function () {
    const popeId1 = 42n
    const popeId2 = 43n

    beforeEach(async function () {
      // Setup scenario with multiple bets
      await conclave.setOpen(true)

      // Addr1 bets on Pope 42
      await conclave
        .connect(addr1)
        .placeBet(popeId1, { value: ethers.parseEther("1") })

      // Addr2 bets on Pope 43
      await conclave
        .connect(addr2)
        .placeBet(popeId2, { value: ethers.parseEther("2") })

      // Close betting and set winner
      await conclave.setOpen(false)
      await conclave.setWinner(popeId1)
    })

    it("Should allow winners to redeem prizes", async function () {
      const initialBalance = await ethers.provider.getBalance(addr1.address)

      // Redeem prize
      const tx = await conclave.connect(addr1).redeemPrize()
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      const finalBalance = await ethers.provider.getBalance(addr1.address)

      // Get contract bag before redemption
      const contractBag = await conclave.bag()

      // Balance should increase by the prize amount minus gas costs
      expect(finalBalance - initialBalance + gasUsed).to.equal(contractBag)
    })

    it("Should emit PrizeRedeemed event when prize is redeemed", async function () {
      const contractBag = await conclave.bag()

      await expect(conclave.connect(addr1).redeemPrize())
        .to.emit(conclave, "PrizeRedeemed")
        .withArgs(addr1.address, contractBag)
    })

    it("Should not allow non-winners to redeem prizes", async function () {
      await expect(conclave.connect(addr2).redeemPrize()).to.be.revertedWith(
        "You didn't vote for the winning Pope"
      )
    })

    it("Should not allow winners to redeem prizes twice", async function () {
      await conclave.connect(addr1).redeemPrize()
      await expect(conclave.connect(addr1).redeemPrize()).to.be.revertedWith(
        "You have already claimed your prize"
      )
    })

    it("Should not allow prize redemption when winner hasn't been set", async function () {
      // Deploy fresh contract
      conclave = await TheConclave.deploy(FEE)
      await conclave.waitForDeployment()

      await conclave.setOpen(true)
      await conclave
        .connect(addr1)
        .placeBet(popeId1, { value: ethers.parseEther("1") })
      await conclave.setOpen(false)

      // Try to claim without winner being set
      await expect(conclave.connect(addr1).redeemPrize()).to.be.revertedWith(
        "Pope hasn't been elected yet!"
      )
    })

    it("Should not allow prize redemption when betting is still open", async function () {
      // Deploy fresh contract
      conclave = await TheConclave.deploy(FEE)
      await conclave.waitForDeployment()

      await conclave.setOpen(true)
      await conclave
        .connect(addr1)
        .placeBet(popeId1, { value: ethers.parseEther("1") })

      // Try to claim when betting is still open (even though there's no winner yet)
      await expect(conclave.connect(addr1).redeemPrize()).to.be.revertedWith(
        "Betting period is still open!"
      )
    })
  })

  describe("Emergency and admin functions", function () {
    const popeId1 = 42n
    const popeId2 = 43n

    beforeEach(async function () {
      // Setup scenario with multiple bets
      await conclave.setOpen(true)

      // Addr1 and addr2 bet on different popes
      await conclave
        .connect(addr1)
        .placeBet(popeId1, { value: ethers.parseEther("1") })
      await conclave
        .connect(addr2)
        .placeBet(popeId2, { value: ethers.parseEther("2") })

      // Close betting and set winner
      await conclave.setOpen(false)
      await conclave.setWinner(popeId1)
    })

    it("Should allow owner to withdraw extra funds after some prizes are claimed", async function () {
      // Addr1 claims their prize
      await conclave.connect(addr1).redeemPrize()

      // At this point, addr1 has claimed their prize, but addr2 hasn't (and won't be able to since they bet on the wrong pope)
      // There may be some extra ETH in the contract from fees or rounding

      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      )
      const contractBalance = await ethers.provider.getBalance(
        await conclave.getAddress()
      )

      // Owner withdraws
      const tx = await conclave.emergencyWithdraw()
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address)

      // Owner received any extra funds not reserved for prizes
      expect(finalOwnerBalance - initialOwnerBalance + gasUsed).to.equal(
        contractBalance
      )
    })

    it("Should allow owner to retrieve unclaimed funds after time threshold", async function () {
      // Fast forward time to simulate passage of time
      const threshold = 30n * 24n * 60n * 60n // 30 days in seconds
      await time.increase(Number(threshold))

      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      )
      const contractBalance = await ethers.provider.getBalance(
        await conclave.getAddress()
      )

      // Owner retrieves unclaimed funds
      const tx = await conclave.retrieveUnclaimedFunds(threshold)
      const receipt = await tx.wait()
      const gasUsed = receipt.gasUsed * receipt.gasPrice

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address)

      // Owner received all contract funds
      expect(finalOwnerBalance - initialOwnerBalance + gasUsed).to.equal(
        contractBalance
      )
    })

    it("Should not allow non-owners to call owner functions", async function () {
      await expect(
        conclave
          .connect(addr1)
          .changeMinimumBetAmount(ethers.parseEther("0.001"))
      ).to.be.revertedWith("Only owner can call this function")

      await expect(conclave.connect(addr1).changeFee(10n)).to.be.revertedWith(
        "Only owner can call this function"
      )

      await expect(conclave.connect(addr1).setOpen(false)).to.be.revertedWith(
        "Only owner can call this function"
      )

      await expect(conclave.connect(addr1).setWinner(42n)).to.be.revertedWith(
        "Only owner can call this function"
      )

      await expect(
        conclave.connect(addr1).emergencyWithdraw()
      ).to.be.revertedWith("Only owner can call this function")

      await expect(
        conclave.connect(addr1).retrieveUnclaimedFunds(0n)
      ).to.be.revertedWith("Only owner can call this function")
    })

    it("Should not allow retrieveUnclaimedFunds before time threshold", async function () {
      const threshold = 30n * 24n * 60n * 60n // 30 days in seconds
      await expect(
        conclave.retrieveUnclaimedFunds(threshold)
      ).to.be.revertedWith("Time threshold not reached yet")
    })
  })

  describe("Edge cases", function () {
    it("Should handle multiple bets from the same user on different popes", async function () {
      await conclave.setOpen(true)

      await conclave
        .connect(addr1)
        .placeBet(42n, { value: ethers.parseEther("1") })
      await conclave
        .connect(addr1)
        .placeBet(43n, { value: ethers.parseEther("1") })

      // Calculate expected values
      const betAmount = ethers.parseEther("1")
      const feeAmount = (betAmount * FEE) / 100n
      const amountToBet = betAmount - feeAmount

      expect(await conclave.getUserBet(addr1.address, 42n)).to.equal(
        amountToBet
      )
      expect(await conclave.getUserBet(addr1.address, 43n)).to.equal(
        amountToBet
      )
    })

    it("Should handle multiple bets from the same user on the same pope", async function () {
      await conclave.setOpen(true)

      await conclave
        .connect(addr1)
        .placeBet(42n, { value: ethers.parseEther("1") })
      await conclave
        .connect(addr1)
        .placeBet(42n, { value: ethers.parseEther("1") })

      // Calculate expected values
      const betAmount = ethers.parseEther("1")
      const feeAmount = (betAmount * FEE) / 100n
      const amountToBet = betAmount - feeAmount

      expect(await conclave.getUserBet(addr1.address, 42n)).to.equal(
        amountToBet * 2n
      )
    })

    it("Should distribute prizes proportionally when multiple users bet on the winning pope", async function () {
      await conclave.setOpen(true)

      // Addr1 bets 1 ETH on Pope 42
      await conclave
        .connect(addr1)
        .placeBet(42n, { value: ethers.parseEther("1") })

      // Addr2 bets 2 ETH on Pope 42
      await conclave
        .connect(addr2)
        .placeBet(42n, { value: ethers.parseEther("2") })

      // Another user bets 3 ETH on Pope 43
      await conclave
        .connect(addrs[0])
        .placeBet(43n, { value: ethers.parseEther("3") })

      // Close betting and set Pope 42 as winner
      await conclave.setOpen(false)
      await conclave.setWinner(42n)

      // Get values to calculate expected prize
      const userBet1 = await conclave.getUserBet(addr1.address, 42n)
      const totalBetsOnWinner = await conclave.totalBetsByPopeId(42n)
      const bagBefore = await conclave.bag()

      // Calculate expected prize - this should match contract calculation
      const expectedPrize1 = (userBet1 * bagBefore) / totalBetsOnWinner

      // Check Addr1's prize
      const initialBalance1 = await ethers.provider.getBalance(addr1.address)
      const tx1 = await conclave.connect(addr1).redeemPrize()
      const receipt1 = await tx1.wait()
      const gasUsed1 = receipt1.gasUsed * receipt1.gasPrice
      const finalBalance1 = await ethers.provider.getBalance(addr1.address)

      // Calculate actual prize received
      const actualPrize1 = finalBalance1 - initialBalance1 + gasUsed1

      // Expect the difference to be very small (allow for minimal rounding)
      expect(actualPrize1).to.be.closeTo(expectedPrize1, 100n)

      // Check Addr2's prize
      const userBet2 = await conclave.getUserBet(addr2.address, 42n)
      const bagAfter = await conclave.bag()
      const remainingBetsOnWinner = totalBetsOnWinner - userBet1
      const expectedPrize2 = (userBet2 * bagAfter) / remainingBetsOnWinner

      const initialBalance2 = await ethers.provider.getBalance(addr2.address)
      const tx2 = await conclave.connect(addr2).redeemPrize()
      const receipt2 = await tx2.wait()
      const gasUsed2 = receipt2.gasUsed * receipt2.gasPrice
      const finalBalance2 = await ethers.provider.getBalance(addr2.address)

      const actualPrize2 = finalBalance2 - initialBalance2 + gasUsed2

      expect(actualPrize2).to.be.closeTo(expectedPrize2, 100n)
    })
  })
})
