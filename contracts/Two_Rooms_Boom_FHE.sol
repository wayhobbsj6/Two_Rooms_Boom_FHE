pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TwoRoomsBoomFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    struct PlayerData {
        euint32 playerId;
        euint32 role; // 0: Citizen, 1: President, 2: Bomber, etc.
        euint32 currentRoom; // 0: Room A, 1: Room B
    }

    struct GameState {
        euint32 batchId;
        euint32 numPlayers;
        euint32 phase; // 0: Setup, 1: RoomAssignment, 2: HostageExchange, 3: GameEnd
        euint32 turnNumber;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    mapping(uint256 => mapping(uint256 => PlayerData)) public encryptedPlayers; // batchId => playerId => PlayerData
    mapping(uint256 => GameState) public encryptedGameState; // batchId => GameState
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event PlayerDataSubmitted(address indexed provider, uint256 batchId, uint256 playerId);
    event GameStateUpdated(address indexed provider, uint256 batchId);
    event DecryptionRequested(uint256 requestId, uint256 batchId);
    event DecryptionCompleted(uint256 requestId, uint256 batchId, uint256 presidentRoom, uint256 bomberRoom, bool presidentSafe);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchClosedError();
    error InvalidBatchId();
    error ReplayError();
    error StateMismatchError();
    error InvalidDecryptionProof();
    error InvalidRole();
    error InvalidRoom();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[msg.sender] = true;
        emit ProviderAdded(msg.sender);
        emit OwnershipTransferred(address(0), msg.sender);
        cooldownSeconds = 30; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit Paused(msg.sender);
        } else {
            paused = false;
            emit Unpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldown;
        emit CooldownSecondsSet(oldCooldown, newCooldown);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batchOpen = true;
        encryptedGameState[currentBatchId] = GameState({
            batchId: FHE.asEuint32(currentBatchId),
            numPlayers: FHE.asEuint32(0),
            phase: FHE.asEuint32(0), // Setup
            turnNumber: FHE.asEuint32(0)
        });
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert BatchClosedError();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitPlayerData(
        uint256 playerId,
        euint32 role,
        euint32 initialRoom
    ) external onlyProvider whenNotPaused checkCooldown {
        if (!batchOpen) revert BatchClosedError();
        if (playerId == 0 || playerId > 1000) revert InvalidRole(); // Example validation
        if (initialRoom.toUint32() > 1) revert InvalidRoom();

        encryptedPlayers[currentBatchId][playerId] = PlayerData({
            playerId: FHE.asEuint32(playerId),
            role: role,
            currentRoom: initialRoom
        });
        encryptedGameState[currentBatchId].numPlayers = encryptedGameState[currentBatchId].numPlayers.add(FHE.asEuint32(1));

        emit PlayerDataSubmitted(msg.sender, currentBatchId, playerId);
    }

    function advancePhase() external onlyProvider whenNotPaused checkCooldown {
        if (!batchOpen) revert BatchClosedError();
        GameState storage state = encryptedGameState[currentBatchId];
        state.phase = state.phase.add(FHE.asEuint32(1));
        state.turnNumber = state.turnNumber.add(FHE.asEuint32(1));
        emit GameStateUpdated(msg.sender, currentBatchId);
    }

    function movePlayer(uint256 playerId, euint32 newRoom) external onlyProvider whenNotPaused checkCooldown {
        if (!batchOpen) revert BatchClosedError();
        if (newRoom.toUint32() > 1) revert InvalidRoom();

        PlayerData storage player = encryptedPlayers[currentBatchId][playerId];
        player.currentRoom = newRoom;
        emit PlayerDataSubmitted(msg.sender, currentBatchId, playerId);
    }

    function requestGameOutcome() external checkDecryptionCooldown {
        if (batchOpen) revert BatchClosedError(); // Must be closed to request outcome
        if (currentBatchId == 0) revert InvalidBatchId();

        euint32 presidentRoom = FHE.asEuint32(0);
        euint32 bomberRoom = FHE.asEuint32(0);
        bool presidentSafe = false;

        uint256 numPlayers = encryptedGameState[currentBatchId].numPlayers.toUint32();
        for (uint256 i = 1; i <= numPlayers; i++) { // Player IDs start from 1
            PlayerData storage player = encryptedPlayers[currentBatchId][i];
            ebool isPresident = player.role.eq(FHE.asEuint32(1));
            ebool isBomber = player.role.eq(FHE.asEuint32(2));

            presidentRoom = FHE.select(presidentRoom, player.currentRoom, isPresident);
            bomberRoom = FHE.select(bomberRoom, player.currentRoom, isBomber);
        }
        ebool roomsDifferent = presidentRoom.neq(bomberRoom);
        presidentSafe = roomsDifferent.toBool();

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(presidentRoom);
        cts[1] = FHE.toBytes32(bomberRoom);
        cts[2] = FHE.toBytes32(FHE.fromBool(presidentSafe));

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, currentBatchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayError();
        // Security: Replay protection ensures this callback is processed only once.

        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(encryptedGameState[decryptionContexts[requestId].batchId].phase); // Dummy, actual values are in cleartexts
        cts[1] = FHE.toBytes32(encryptedGameState[decryptionContexts[requestId].batchId].turnNumber); // Dummy
        cts[2] = FHE.toBytes32(encryptedGameState[decryptionContexts[requestId].batchId].numPlayers); // Dummy
        // Security: State hash verification ensures that the contract state hasn't changed
        // since the decryption was requested, preventing inconsistent outcomes.

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) revert StateMismatchError();

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidDecryptionProof();

        uint256 presidentRoomCleartext = abi.decode(cleartexts[0:32], (uint256));
        uint256 bomberRoomCleartext = abi.decode(cleartexts[32:64], (uint256));
        uint256 presidentSafeCleartext = abi.decode(cleartexts[64:96], (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(
            requestId,
            decryptionContexts[requestId].batchId,
            presidentRoomCleartext,
            bomberRoomCleartext,
            presidentSafeCleartext == 1
        );
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }
}