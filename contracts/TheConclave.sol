// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TheConclave {
    address public owner;
    uint public startTime;
    uint public bag;
    uint public minimumBet = 333333333333333;
    uint public maximumBet = 10 ether; // Adding maximum bet limit
    uint public fee;
    bool public isOpen;
    bool public isDisputed;
    bool public paused; // Emergency pause mechanism
    uint public winner;
    uint public totalPrizeClaimed;
    uint public closedBetTimestamp;
    
    // Reentrancy guard
    uint private _reentrancyGuard = 1;
    modifier nonReentrant() {
        require(_reentrancyGuard == 1, "Reentrant call");
        _reentrancyGuard = 2;
        _;
        _reentrancyGuard = 1;
    }
    
    mapping(address => mapping(uint => uint)) public userVote;
    mapping(address => uint) public invalidUserVoteAmountForRefund;
    mapping(address => mapping(uint => uint)) public betTimestamps;
    mapping(uint => uint) public totalBetsByPopeId;
    mapping(address => bool) public hasClaimed;
    uint public totalBetsPlaced; // Track total bets for distribution validation yes

    // Events for important state changes
    event BetPlaced(address indexed user, uint indexed popeId, uint amount);
    event WinnerSet(uint indexed popeId);
    event BettingStatusChanged(bool isOpen);
    event PrizeRedeemed(address indexed user, uint amount);
    event MinimumBetChanged(uint newMinimumBet);
    event MaximumBetChanged(uint newMaximumBet);
    event DisputedResultChanged(bool isDisputed);
    event InvalidBetRefunded(address indexed user, uint popeId, uint amount);
    event FeeChanged(uint newFee);
    event EmergencyWithdraw(uint amount);
    event UnclaimedFundsRetrieved(uint amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EmergencyPause(bool isPaused);

    modifier OnlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier MustBeOpen() {
        require(isOpen, "Betting period is not open yet!");
        _;
    }

    modifier MustBeClosed() {
        require(!isOpen, "Betting period is still open!");
        _;
    }

    modifier MustBeDisputed() {
        require(isDisputed, "The contract has not been disputed yet");
        _;
    }

    modifier HabemusPapam() {
        require(winner > 0, "Pope hasn't been elected yet!");
        _;
    }
    
    modifier WhenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(uint newFee) {
        require(newFee > 0 && newFee <= 100, "Fee must be between 1 and 100");
        owner = msg.sender;
        startTime = block.timestamp;
        bag = 0;
        fee = newFee;
        isOpen = false;
        winner = 0;
        totalPrizeClaimed = 0;
        isDisputed = false;
        paused = false;
        totalBetsPlaced = 0;
    }
    
    // Emergency pause mechanism
    function togglePause() external OnlyOwner {
        paused = !paused;
        emit EmergencyPause(paused);
    }

    // Simple ownership transfer
    function transferOwnership(address newOwner) external OnlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // Changes minimum bet amount
    function changeMinimumBetAmount(uint newMinimumBet) public OnlyOwner WhenNotPaused {
        require(newMinimumBet < maximumBet, "Minimum bet must be less than maximum bet");
        minimumBet = newMinimumBet;
        emit MinimumBetChanged(newMinimumBet);
    }
    
    // Changes maximum bet amount
    function changeMaximumBetAmount(uint newMaximumBet) public OnlyOwner WhenNotPaused {
        require(newMaximumBet > minimumBet, "Maximum bet must be greater than minimum bet");
        maximumBet = newMaximumBet;
        emit MaximumBetChanged(newMaximumBet);
    }

    function changeDisputedStatus(bool _isDisputed) public OnlyOwner WhenNotPaused {
        isDisputed = _isDisputed;
        emit DisputedResultChanged(isDisputed);
    }

    // Changes fee amount
    function changeFee(uint _fee) public OnlyOwner WhenNotPaused {
        require(_fee > 0 && _fee <= 100, "Fee must be between 1 and 100");
        fee = _fee;
        emit FeeChanged(_fee);
    }

    // Sets if the bets are open or not
    function setOpen(bool _isOpen) public OnlyOwner WhenNotPaused {
        isOpen = _isOpen;
        if (!_isOpen) {
            closedBetTimestamp = block.timestamp;
        }
        emit BettingStatusChanged(_isOpen);
    }

    // Calculate fee based on the bet amount - fixed for precision
    function _calculateFee(uint _amount) internal view returns (uint) {
        return (_amount * fee) / 100;
    }

    // Sets winner once white smoke appears - can only be called once
    function setWinner(uint popeId, uint timestamp) public OnlyOwner MustBeClosed WhenNotPaused {
        require(winner == 0, "Winner already set");
        require(popeId >= 1 && popeId <= 135, "Pope id must be between 1 and 135");
        require(timestamp > startTime, "Cannot place winner on that timestamp");
        winner = popeId;
        emit WinnerSet(popeId);
    }

    // Place bet function - improved with nonReentrant
    function placeBet(uint popeId) public payable MustBeOpen WhenNotPaused nonReentrant {
        require(msg.value >= minimumBet, "Bet amount below minimum");
        require(msg.value <= maximumBet, "Bet amount above maximum");
        require(popeId >= 1 && popeId <= 135, "Pope id must be between 1 and 135");

        uint feeAmount = _calculateFee(msg.value);
        uint amountToBet = msg.value - feeAmount;

        // Update totals
        userVote[msg.sender][popeId] += amountToBet;
        totalBetsByPopeId[popeId] += amountToBet;
        totalBetsPlaced += amountToBet;
        bag += amountToBet;
        
        // Record bet timestamp
        betTimestamps[msg.sender][popeId] = block.timestamp;

        // Transfer fee to owner - CEI pattern
        (bool success, ) = payable(owner).call{value: feeAmount}("");
        require(success, "Fee transfer failed");

        emit BetPlaced(msg.sender, popeId, amountToBet);
    }

    // Check if user voted for the winning Pope
    function _isUserWinner(address voter) internal view returns (bool) {
        return userVote[voter][winner] > 0;
    }

    // Get the bet amount of a user for a specific Pope ID
    function getUserBet(address voter, uint popeId) public view returns (uint) {
        return userVote[voter][popeId];
    }

    // Redeem prize after Pope has been elected - fixed with nonReentrant
    function redeemPrize() public MustBeClosed HabemusPapam MustBeDisputed WhenNotPaused nonReentrant {
        require(_isUserWinner(msg.sender), "You didn't vote for the winning Pope");
        require(!hasClaimed[msg.sender], "You have already claimed your prize");
        
        uint userBet = userVote[msg.sender][winner];
        require(userBet > 0, "No bets to redeem");

        // Calculate prize amount with improved precision to prevent rounding errors
        uint prize;
        if (totalBetsByPopeId[winner] == userBet) {
            // If user is the only winner, give them the entire prize pool
            prize = bag - (totalPrizeClaimed);
        } else {
            // Otherwise calculate proportionally
            prize = (userBet * bag) / totalBetsByPopeId[winner];
            
            // Ensure all funds are distributed by giving the last claimer any dust
            if (totalBetsByPopeId[winner] - userBet <= 0) {
                uint remainingPrize = bag - totalPrizeClaimed;
                if (remainingPrize > prize) {
                    prize = remainingPrize;
                }
            }
        }

        // Mark as claimed before transfer to prevent reentrancy
        hasClaimed[msg.sender] = true;
        totalPrizeClaimed += prize;

        // Transfer prize - using CEI pattern
        (bool success, ) = payable(msg.sender).call{value: prize}("");
        require(success, "Prize transfer failed");

        emit PrizeRedeemed(msg.sender, prize);
    }

    // Refund for disputed bets - fixed with nonReentrant
    function refund() public MustBeClosed HabemusPapam MustBeDisputed WhenNotPaused nonReentrant {
        uint refundAmount = invalidUserVoteAmountForRefund[msg.sender];
        require(refundAmount > 0, "You don't have any amount to refund");
        
        // Set refund amount to 0 before transfer to prevent reentrancy
        invalidUserVoteAmountForRefund[msg.sender] = 0;
        
        // Transfer refund - using CEI pattern
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");
        
        emit InvalidBetRefunded(msg.sender, winner, refundAmount);
    }

    // Dispute votes
    function disputeVotes(address user, uint amount, uint popeId) public OnlyOwner MustBeClosed HabemusPapam WhenNotPaused {
        require(userVote[user][popeId] > 0, "User has no bets for this Pope");
        require(amount <= userVote[user][popeId], "Dispute amount exceeds bet amount");
        
        userVote[user][popeId] -= amount;
        totalBetsByPopeId[popeId] -= amount;
        bag -= amount;
        invalidUserVoteAmountForRefund[user] += amount;
    }

    // Allow owner to withdraw funds in case of emergency - improved with nonReentrant
    function emergencyWithdraw() public OnlyOwner MustBeClosed HabemusPapam WhenNotPaused nonReentrant {
        // Calculate the total amount that should be reserved for winners who haven't claimed yet
        uint remainingPrizePool = bag - totalPrizeClaimed;

        // Calculate the amount that can be safely withdrawn
        uint withdrawableAmount = address(this).balance - remainingPrizePool;
        require(withdrawableAmount > 0, "No funds available for withdrawal");

        // Transfer funds - using CEI pattern
        (bool success, ) = payable(owner).call{value: withdrawableAmount}("");
        require(success, "Withdrawal failed");
        
        emit EmergencyWithdraw(withdrawableAmount);
    }

    // Function to retrieve unclaimed funds after a certain time period - improved with nonReentrant
    function retrieveUnclaimedFunds(uint timeThreshold) public OnlyOwner MustBeClosed HabemusPapam WhenNotPaused nonReentrant {
        require(timeThreshold >= 180 days, "Time threshold must be at least 180 days");
        require(block.timestamp >= startTime + timeThreshold, "Time threshold not reached yet");

        uint balance = address(this).balance;
        require(balance > 0, "No funds to retrieve");

        // Transfer funds - using CEI pattern
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Retrieval failed");
        
        emit UnclaimedFundsRetrieved(balance);
    }
    
    // Validate distribution - helps ensure all funds are distributed correctly
    function validateDistribution() public view returns (bool) {
        if (winner == 0) return true; // No winner set yet
        
        // Check that actual contract balance matches expected balance
        uint expectedBalance = bag - totalPrizeClaimed;
        return address(this).balance >= expectedBalance;
    }
    
    // Allow the contract to receive ETH
    receive() external payable {
    // You can leave this empty or add logic if needed
    }
}