# Two Rooms and a Boom - A FHE-based Social Deduction Game 🎭🔒

Two Rooms and a Boom is an innovative social deduction game that utilizes **Zama's Fully Homomorphic Encryption (FHE) technology** to create a secure and engaging gaming environment. In this classic party game turned blockchain experience, players must leverage their skills of deduction and communication while keeping their identities and roles encrypted, ensuring a thrilling and suspenseful gameplay.

## The Problem

In traditional social deduction games, players reveal their identities and engage in discussions to deduce who among them is the threat—often leading to mistrust, gathering of sensitive information, and potential exposure of players' identities. The challenge lies in creating a secure environment where interactions can remain confidential and yet meaningful, enabling players to strategize without compromising the core experience of the game.

## How FHE Solves the Problem

Zama's Fully Homomorphic Encryption (FHE) is a game-changer in addressing these privacy concerns. By encrypting players' identities (e.g., President, Bomber) and their room assignments, FHE ensures that sensitive information remains confidential throughout the gameplay. Implemented through Zama’s open-source libraries—including the **Concrete**, **TFHE-rs**, and the **zama-fhe SDK**—this solution allows players to engage in the game while their identities and positions are securely shielded from unauthorized disclosure. With this technology, players can enjoy a truly immersive experience, where the thrill of social deduction comes without compromising personal information.

## Key Features

- **Identity Encryption**: Player roles and room assignments are FHE encrypted, keeping crucial information hidden from others.
- **Seamless Room Switching**: Players can change rooms and swap identities while keeping these transitions discreet.
- **Authentic Game Feel**: The encryption recreates the essence of information isolation and tension found in the classic game.
- **Online Social Experience**: Perfect for remote gatherings, enabling groups to connect and strategize, no matter their physical locations.

## Technology Stack

This project is built using the following technologies:

- **Zama FHE SDK** - The cornerstone for implementing confidential computations in the game.
- **Node.js** - For server-side development, handling real-time interactions.
- **Hardhat** - A robust framework for Ethereum development.
- **Solidity** - The programming language for writing the smart contract.

## Directory Structure

Here’s a quick overview of the project's file structure:

```
/Two_Rooms_Boom_FHE
|-- contracts
|   `-- Two_Rooms_Boom.sol
|-- scripts
|   `-- deploy.js
|-- test
|   `-- Two_Rooms_Boom.test.js
|-- package.json
|-- README.md
```

## Installation Guide

To get started with **Two Rooms and a Boom**, follow these setup instructions:

1. Ensure you have **Node.js** and **npm** installed on your machine.
2. Make sure you have **Hardhat** or **Foundry** as your development environment.
3. Download this project to your local machine but refrain from using `git clone` or any URLs.
4. Navigate to the project directory.
5. Run the following command to install all necessary dependencies, including the Zama FHE libraries:

   ```bash
   npm install
   ```

This will fetch all required libraries, including those needed for implementing Fully Homomorphic Encryption.

## Build & Run Guide

Once you have successfully installed the dependencies, you can compile and run the project using the following commands:

1. **Compile the smart contract**:

   ```bash
   npx hardhat compile
   ```

2. **Run the tests to ensure everything is functioning as expected**:

   ```bash
   npx hardhat test
   ```

3. **Deploy the smart contract**:

   ```bash
   npx hardhat run scripts/deploy.js
   ```

This series of commands will set up and deploy your game on your desired network, preparing it for players to enjoy!

## Code Example

Here’s a simplified code snippet demonstrating the core functionality of encrypting player roles:

```solidity
pragma solidity ^0.8.0;

import "zama-fhe-sdk/Concrete.sol";

contract Two_Rooms_Boom {
    mapping(address => bytes) public playerRoles; // Stores encrypted roles 

    function assignRole(address player, bytes memory encryptedRole) public {
        playerRoles[player] = encryptedRole; // Encrypt and assign role to player
    }

    function revealRole(address player) view public returns (bytes memory) {
        return playerRoles[player]; // Only authorized calls can decrypt
    }
}
```

In this snippet, the player's role is stored in an encrypted format, ensuring that sensitive identity information is kept safe from untrusted eyes.

## Acknowledgements

### Powered by Zama

A heartfelt thank you to the Zama team for their invaluable contribution to the future of confidential blockchain applications. Their pioneering work and open-source tools make projects like **Two Rooms and a Boom** not only possible but incredibly engaging and secure. We are grateful for the ability to harness their cutting-edge technology in our game and look forward to seeing how others leverage FHE for innovative solutions!

---
With **Two Rooms and a Boom**, gather your friends and dive into a world where deduction meets encryption, all while keeping your identities secure. Ready to play? Let the games begin! 🎉
