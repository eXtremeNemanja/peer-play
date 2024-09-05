// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract VideoStreaming {
    struct Video {
        string ipfsHash;
        address owner;
        uint256 price;
        bool isAvailable;
    }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;
    mapping(string => mapping(address => bool)) public videoPurchasers;

    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    // Function to upload a new video
    function uploadVideo(string memory _ipfsHash, uint256 _price) public {
        require(videos[_ipfsHash].owner == address(0), "Video already exists");

        videos[_ipfsHash] = Video({
            ipfsHash: _ipfsHash,
            owner: msg.sender,
            price: _price,
            isAvailable: true
        });

        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }

    // Function to purchase access to a video
    function purchaseVideo(string memory _ipfsHash) public payable {
        Video storage video = videos[_ipfsHash];
        require(video.isAvailable, "Video is not available");
        require(msg.value >= video.price, "Insufficient payment");

        balances[video.owner] += msg.value;

        videoPurchasers[_ipfsHash][msg.sender] = true; // Record the purchase

        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // Function to withdraw earnings
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to withdraw");

        balances[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }

    // Function to check if a user has purchased a video
    function hasPurchased(
        string memory _ipfsHash,
        address _user
    ) public view returns (bool) {
        return videoPurchasers[_ipfsHash][_user];
    }
}
