pragma solidity ^0.8.0;

contract TheConclave {
    address public owner;
    uint public startTime;
    uint public bag;
    uint public minimumBet = 333333333333333;
    uint public fee;
    bool public isOpen;
    uint public winner;
    uint public totalPrizeClaimed;
    mapping(address => mapping(uint => uint)) public userVote;
    mapping(uint => uint) public totalBetsByPopeId;
    mapping(address => bool) public hasClaimed;

    // Events for important state changes
    event BetPlaced(address indexed user, uint indexed popeId, uint amount);
    event WinnerSet(uint indexed popeId);
    event BettingStatusChanged(bool isOpen);
    event PrizeRedeemed(address indexed user, uint amount);
    event MinimumBetChanged(uint newMinimumBet);
    event FeeChanged(uint newFee);

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

    modifier HabemusPapam() {
        require(winner > 0, "Pope hasn't been elected yet!");
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
    }

    // Changes minimum bet amount
    function changeMinimumBetAmount(uint newMinimumBet) public OnlyOwner {
        minimumBet = newMinimumBet;
        emit MinimumBetChanged(newMinimumBet);
    }

    // Changes fee amount
    function changeFee(uint _fee) public OnlyOwner {
        require(_fee > 0 && _fee <= 100, "Fee must be between 1 and 100");
        fee = _fee;
        emit FeeChanged(_fee);
    }

    // Sets if the bets are open or not
    function setOpen(bool _isOpen) public OnlyOwner {
        isOpen = _isOpen;
        emit BettingStatusChanged(_isOpen);
    }
    
    // Calculate fee based on the bet amount
    function _calculateFee(uint _amount) internal view returns (uint) {
        return ((_amount * fee) / 100);
    }

    // Sets winner once white smoke appears
    function setWinner(uint popeId) public OnlyOwner MustBeClosed {
        require(popeId >= 1 && popeId <= 135, "Pope id must be between 1 and 135");
        winner = popeId;
        emit WinnerSet(popeId);
    }

    // Place bet function
    function placeBet(uint popeId) public payable MustBeOpen {
        require(msg.value >= minimumBet, "Bet amount below minimum");
        require(popeId >= 1 && popeId <= 135, "Pope id must be between 1 and 135");
        
        uint feeAmount = _calculateFee(msg.value);
        uint amountToBet = msg.value - feeAmount;
        
        // Transfer fee to owner
        (bool success, ) = payable(owner).call{value: feeAmount}("");
        require(success, "Fee transfer failed");

        // Record the bet
        userVote[msg.sender][popeId] += amountToBet;
        totalBetsByPopeId[popeId] += amountToBet;
        bag += amountToBet;
        
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


    // Redeem prize after Pope has been elected
    function redeemPrize() public MustBeClosed HabemusPapam {
        require(_isUserWinner(msg.sender), "You didn't vote for the winning Pope");
        require(!hasClaimed[msg.sender], "You have already claimed your prize");
        
        uint userBet = userVote[msg.sender][winner];
        require(userBet > 0, "No bets to redeem");
        
        // Calculate prize amount
        uint prize = (userBet * bag) / totalBetsByPopeId[winner];
        
        // Mark as claimed before transfer to prevent reentrancy
        hasClaimed[msg.sender] = true;
        totalPrizeClaimed += prize;
        
        // Transfer prize
        (bool success, ) = payable(msg.sender).call{value: prize}("");
        require(success, "Prize transfer failed");
        
        emit PrizeRedeemed(msg.sender, prize);
    }
    
    // Allow owner to withdraw funds in case of emergency
    function emergencyWithdraw() public OnlyOwner MustBeClosed HabemusPapam {
        // Calculate the total amount that should be reserved for winners who haven't claimed yet
        uint remainingPrizePool = bag - totalPrizeClaimed;
        
        // Calculate the amount that can be safely withdrawn
        uint withdrawableAmount = address(this).balance - remainingPrizePool;
        require(withdrawableAmount > 0, "No funds available for withdrawal");
        
        (bool success, ) = payable(owner).call{value: withdrawableAmount}("");
        require(success, "Withdrawal failed");
    }
    
    // Function to retrieve unclaimed funds after a certain time period
    // Can be called only after a reasonable time has passed since winner was declared
    function retrieveUnclaimedFunds(uint timeThreshold) public OnlyOwner MustBeClosed HabemusPapam {
        require(block.timestamp >= startTime + timeThreshold, "Time threshold not reached yet");
        
        uint balance = address(this).balance;
        require(balance > 0, "No funds to retrieve");
        
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Retrieval failed");
    }
}