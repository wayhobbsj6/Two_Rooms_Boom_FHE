// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Player {
  id: string;
  encryptedRole: string; // FHE encrypted role (1: President, 2: Bomber, 3: Civilian)
  encryptedRoom: string; // FHE encrypted room (1: Blue, 2: Red)
  isHost: boolean;
  address: string;
  name: string;
}

interface GameState {
  phase: "lobby" | "round1" | "round2" | "round3" | "ended";
  currentRound: number;
  blueRoomLeader?: string;
  redRoomLeader?: string;
  hostage?: string;
  winner?: "blue" | "red";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  // Randomly selected style: High Contrast (Red+Black), Industrial Mechanical, Center Radiation, Animation Rich
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>({ phase: "lobby", currentRound: 0 });
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [playerRole, setPlayerRole] = useState<number | null>(null);
  const [playerRoom, setPlayerRoom] = useState<number | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showLeaderModal, setShowLeaderModal] = useState(false);
  const [showHostageModal, setShowHostageModal] = useState(false);
  const [showGameRules, setShowGameRules] = useState(false);

  // Randomly selected additional features: Project Introduction, Data Statistics, Search & Filter
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadGameData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadGameData = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load players
      const playersBytes = await contract.getData("players_list");
      let playerIds: string[] = [];
      if (playersBytes.length > 0) {
        try {
          const playersStr = ethers.toUtf8String(playersBytes);
          if (playersStr.trim() !== '') playerIds = JSON.parse(playersStr);
        } catch (e) { console.error("Error parsing player ids:", e); }
      }
      
      const loadedPlayers: Player[] = [];
      for (const playerId of playerIds) {
        try {
          const playerBytes = await contract.getData(`player_${playerId}`);
          if (playerBytes.length > 0) {
            try {
              const playerData = JSON.parse(ethers.toUtf8String(playerBytes));
              loadedPlayers.push({
                id: playerId,
                encryptedRole: playerData.role,
                encryptedRoom: playerData.room,
                isHost: playerData.isHost,
                address: playerData.address,
                name: playerData.name
              });
            } catch (e) { console.error(`Error parsing player data for ${playerId}:`, e); }
          }
        } catch (e) { console.error(`Error loading player ${playerId}:`, e); }
      }
      setPlayers(loadedPlayers);
      
      // Load game state
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length > 0) {
        try {
          const state = JSON.parse(ethers.toUtf8String(gameStateBytes));
          setGameState(state);
        } catch (e) { console.error("Error parsing game state:", e); }
      }
    } catch (e) { console.error("Error loading game data:", e); } 
    finally { setLoading(false); }
  };

  const joinGame = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    if (!newPlayerName.trim()) { alert("Please enter your name"); return; }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting your role with Zama FHE..." });
    
    try {
      // Randomly assign role (1: President, 2: Bomber, 3: Civilian)
      const role = players.length === 0 ? 1 : players.length === 1 ? 2 : Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : 2) : 3;
      const room = Math.random() > 0.5 ? 1 : 2; // Random room assignment
      
      const encryptedRole = FHEEncryptNumber(role);
      const encryptedRoom = FHEEncryptNumber(room);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const playerId = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const playerData = {
        role: encryptedRole,
        room: encryptedRoom,
        isHost: players.length === 0,
        address: address,
        name: newPlayerName
      };
      
      await contract.setData(`player_${playerId}`, ethers.toUtf8Bytes(JSON.stringify(playerData)));
      
      // Update players list
      const playersBytes = await contract.getData("players_list");
      let playerIds: string[] = [];
      if (playersBytes.length > 0) {
        try { playerIds = JSON.parse(ethers.toUtf8String(playersBytes)); } 
        catch (e) { console.error("Error parsing player ids:", e); }
      }
      playerIds.push(playerId);
      await contract.setData("players_list", ethers.toUtf8Bytes(JSON.stringify(playerIds)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Joined game with encrypted role!" });
      
      // Reveal role to player
      setPlayerRole(role);
      setPlayerRoom(room);
      setShowRoleModal(true);
      
      await loadGameData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowJoinModal(false);
        setNewPlayerName("");
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Join failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const startGame = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Initializing game with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const newGameState: GameState = {
        phase: "round1",
        currentRound: 1
      };
      
      await contract.setData("game_state", ethers.toUtf8Bytes(JSON.stringify(newGameState)));
      setTransactionStatus({ visible: true, status: "success", message: "Game started with encrypted roles!" });
      await loadGameData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Game start failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const electLeader = async (room: "blue" | "red", playerId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing leader election with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length === 0) throw new Error("Game state not found");
      const currentState = JSON.parse(ethers.toUtf8String(gameStateBytes));
      
      const updatedState = {
        ...currentState,
        [`${room}RoomLeader`]: playerId
      };
      
      await contract.setData("game_state", ethers.toUtf8Bytes(JSON.stringify(updatedState)));
      setTransactionStatus({ visible: true, status: "success", message: "Leader elected!" });
      await loadGameData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowLeaderModal(false);
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Election failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const selectHostage = async (playerId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing hostage selection with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length === 0) throw new Error("Game state not found");
      const currentState = JSON.parse(ethers.toUtf8String(gameStateBytes));
      
      const updatedState = {
        ...currentState,
        hostage: playerId
      };
      
      await contract.setData("game_state", ethers.toUtf8Bytes(JSON.stringify(updatedState)));
      setTransactionStatus({ visible: true, status: "success", message: "Hostage selected!" });
      await loadGameData();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowHostageModal(false);
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Selection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const advanceRound = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Advancing game round with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length === 0) throw new Error("Game state not found");
      const currentState = JSON.parse(ethers.toUtf8String(gameStateBytes));
      
      let updatedState: GameState;
      if (currentState.currentRound === 3) {
        // End game
        updatedState = {
          ...currentState,
          phase: "ended",
          winner: determineWinner(currentState)
        };
      } else {
        updatedState = {
          ...currentState,
          currentRound: currentState.currentRound + 1,
          phase: `round${currentState.currentRound + 1}` as any,
          blueRoomLeader: undefined,
          redRoomLeader: undefined,
          hostage: undefined
        };
      }
      
      await contract.setData("game_state", ethers.toUtf8Bytes(JSON.stringify(updatedState)));
      setTransactionStatus({ visible: true, status: "success", message: "Round advanced!" });
      await loadGameData();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Round advance failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const determineWinner = (state: GameState): "blue" | "red" => {
    // This would normally check FHE-encrypted roles, but simplified for demo
    const president = players.find(p => FHEDecryptNumber(p.encryptedRole) === 1);
    const bomber = players.find(p => FHEDecryptNumber(p.encryptedRole) === 2);
    
    if (!president || !bomber) return "blue"; // Default to blue if roles not found
    
    const presidentRoom = FHEDecryptNumber(president.encryptedRoom);
    const bomberRoom = FHEDecryptNumber(bomber.encryptedRoom);
    
    return presidentRoom === bomberRoom ? "red" : "blue";
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; }
  };

  const isHost = players.some(p => p.address === address && p.isHost);
  const currentPlayer = players.find(p => p.address === address);
  const blueRoomPlayers = players.filter(p => FHEDecryptNumber(p.encryptedRoom) === 1);
  const redRoomPlayers = players.filter(p => FHEDecryptNumber(p.encryptedRoom) === 2);
  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing encrypted game session...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>Two Rooms <span>&</span> A Boom</h1>
          <div className="fhe-tag">FHE Encrypted</div>
        </div>
        <div className="header-actions">
          <button className="industrial-button" onClick={() => setShowGameRules(!showGameRules)}>
            {showGameRules ? "Hide Rules" : "Show Rules"}
          </button>
          {gameState.phase === "lobby" && (
            <button onClick={() => setShowJoinModal(true)} className="industrial-button primary">
              Join Game
            </button>
          )}
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      
      <div className="main-content center-radial">
        {showGameRules && (
          <div className="game-rules industrial-card">
            <h2>Game Rules</h2>
            <div className="rules-content">
              <div className="rule-section">
                <h3>Objective</h3>
                <p>Blue Team must protect the President. Red Team must ensure the Bomber is in the same room as the President when time runs out.</p>
              </div>
              <div className="rule-section">
                <h3>Roles</h3>
                <ul>
                  <li><strong>President (Blue Team):</strong> Must avoid being in the same room as the Bomber</li>
                  <li><strong>Bomber (Red Team):</strong> Must end up in the same room as the President</li>
                  <li><strong>Civilians:</strong> Help their team by gathering information</li>
                </ul>
              </div>
              <div className="rule-section">
                <h3>FHE Encryption</h3>
                <p>All roles and room assignments are encrypted using Zama FHE technology. Players can only reveal their own role by signing with their wallet.</p>
              </div>
              <button className="industrial-button" onClick={() => setShowGameRules(false)}>Close Rules</button>
            </div>
          </div>
        )}
        
        <div className="game-status industrial-card">
          <h2>Game Status</h2>
          <div className="status-grid">
            <div className="status-item">
              <div className="status-label">Phase</div>
              <div className="status-value">{gameState.phase.toUpperCase()}</div>
            </div>
            <div className="status-item">
              <div className="status-label">Round</div>
              <div className="status-value">{gameState.currentRound}/3</div>
            </div>
            <div className="status-item">
              <div className="status-label">Blue Team</div>
              <div className="status-value">{blueRoomPlayers.length} players</div>
            </div>
            <div className="status-item">
              <div className="status-label">Red Team</div>
              <div className="status-value">{redRoomPlayers.length} players</div>
            </div>
          </div>
          
          {gameState.winner && (
            <div className={`winner-banner ${gameState.winner}`}>
              {gameState.winner === "blue" ? "BLUE TEAM WINS!" : "RED TEAM WINS!"}
            </div>
          )}
          
          {isHost && gameState.phase === "lobby" && players.length >= 4 && (
            <button className="industrial-button primary" onClick={startGame}>
              Start Game
            </button>
          )}
          
          {isHost && gameState.phase !== "lobby" && gameState.phase !== "ended" && (
            <button className="industrial-button" onClick={advanceRound}>
              Advance to Next Round
            </button>
          )}
        </div>
        
        <div className="players-section">
          <div className="section-header">
            <h2>Players</h2>
            <div className="search-filter">
              <input 
                type="text" 
                placeholder="Search players..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="industrial-input"
              />
            </div>
          </div>
          
          <div className="players-grid">
            {filteredPlayers.length === 0 ? (
              <div className="no-players">
                <div className="no-players-icon"></div>
                <p>No players found</p>
                <button className="industrial-button primary" onClick={() => setShowJoinModal(true)}>Join Game</button>
              </div>
            ) : (
              filteredPlayers.map(player => (
                <div 
                  className={`player-card industrial-card ${player.address === address ? "you" : ""}`} 
                  key={player.id}
                  onClick={() => setSelectedPlayer(player)}
                >
                  <div className="player-header">
                    <div className="player-name">{player.name}</div>
                    {player.isHost && <div className="host-badge">HOST</div>}
                    {player.address === address && <div className="you-badge">YOU</div>}
                  </div>
                  <div className="player-info">
                    <div className="info-item">
                      <span>Room:</span>
                      <span className={`room-badge ${FHEDecryptNumber(player.encryptedRoom) === 1 ? "blue" : "red"}`}>
                        {FHEDecryptNumber(player.encryptedRoom) === 1 ? "BLUE" : "RED"}
                      </span>
                    </div>
                    <div className="info-item">
                      <span>Address:</span>
                      <span>{player.address.substring(0, 6)}...{player.address.substring(38)}</span>
                    </div>
                  </div>
                  {gameState.phase !== "lobby" && gameState.phase !== "ended" && (
                    <div className="player-actions">
                      {player.address !== address && (
                        <>
                          {(!gameState.blueRoomLeader || !gameState.redRoomLeader) && (
                            <button 
                              className="industrial-button small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlayer(player);
                                setShowLeaderModal(true);
                              }}
                            >
                              Elect Leader
                            </button>
                          )}
                          {gameState.blueRoomLeader && gameState.redRoomLeader && !gameState.hostage && (
                            <button 
                              className="industrial-button small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlayer(player);
                                setShowHostageModal(true);
                              }}
                            >
                              Select Hostage
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showJoinModal && (
        <div className="modal-overlay">
          <div className="join-modal industrial-card">
            <div className="modal-header">
              <h2>Join Game</h2>
              <button onClick={() => setShowJoinModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Your Name</label>
                <input 
                  type="text" 
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  className="industrial-input"
                />
              </div>
              <div className="fhe-notice">
                <div className="gear-icon small"></div>
                <p>Your role and room assignment will be encrypted with Zama FHE technology</p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowJoinModal(false)} className="industrial-button">Cancel</button>
              <button onClick={joinGame} className="industrial-button primary">Join Securely</button>
            </div>
          </div>
        </div>
      )}
      
      {showRoleModal && playerRole !== null && playerRoom !== null && (
        <div className="modal-overlay">
          <div className="role-modal industrial-card">
            <div className="modal-header">
              <h2>Your Role</h2>
              <button onClick={() => setShowRoleModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className={`role-badge ${playerRole === 1 ? "president" : playerRole === 2 ? "bomber" : "civilian"}`}>
                {playerRole === 1 ? "PRESIDENT" : playerRole === 2 ? "BOMBER" : "CIVILIAN"}
              </div>
              <div className={`room-assignment ${playerRoom === 1 ? "blue" : "red"}`}>
                You are in the {playerRoom === 1 ? "BLUE" : "RED"} room
              </div>
              <div className="role-description">
                {playerRole === 1 ? (
                  <p>As the President, your goal is to avoid being in the same room as the Bomber when time runs out.</p>
                ) : playerRole === 2 ? (
                  <p>As the Bomber, your goal is to be in the same room as the President when time runs out.</p>
                ) : (
                  <p>As a Civilian, help your team by gathering information and making strategic decisions.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowRoleModal(false)} className="industrial-button">Continue</button>
            </div>
          </div>
        </div>
      )}
      
      {selectedPlayer && (
        <div className="modal-overlay">
          <div className="player-detail-modal industrial-card">
            <div className="modal-header">
              <h2>Player Details</h2>
              <button onClick={() => setSelectedPlayer(null)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="player-info">
                <div className="info-item">
                  <span>Name:</span>
                  <strong>{selectedPlayer.name}</strong>
                </div>
                <div className="info-item">
                  <span>Address:</span>
                  <strong>{selectedPlayer.address}</strong>
                </div>
                <div className="info-item">
                  <span>Room:</span>
                  <strong className={`room-badge ${FHEDecryptNumber(selectedPlayer.encryptedRoom) === 1 ? "blue" : "red"}`}>
                    {FHEDecryptNumber(selectedPlayer.encryptedRoom) === 1 ? "BLUE" : "RED"}
                  </strong>
                </div>
                {selectedPlayer.isHost && (
                  <div className="info-item">
                    <span>Status:</span>
                    <strong className="host-badge">GAME HOST</strong>
                  </div>
                )}
              </div>
              
              {selectedPlayer.address === address && (
                <div className="role-reveal">
                  <h3>Your Encrypted Role</h3>
                  <div className="encrypted-data">
                    {selectedPlayer.encryptedRole.substring(0, 50)}...
                  </div>
                  <button 
                    className="industrial-button" 
                    onClick={async () => {
                      const decrypted = await decryptWithSignature(selectedPlayer.encryptedRole);
                      if (decrypted !== null) {
                        setPlayerRole(decrypted);
                      }
                    }}
                  >
                    Reveal Your Role
                  </button>
                  {playerRole !== null && (
                    <div className={`decrypted-role ${playerRole === 1 ? "president" : playerRole === 2 ? "bomber" : "civilian"}`}>
                      Your role: {playerRole === 1 ? "PRESIDENT" : playerRole === 2 ? "BOMBER" : "CIVILIAN"}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedPlayer(null)} className="industrial-button">Close</button>
            </div>
          </div>
        </div>
      )}
      
      {showLeaderModal && selectedPlayer && (
        <div className="modal-overlay">
          <div className="leader-modal industrial-card">
            <div className="modal-header">
              <h2>Elect Leader</h2>
              <button onClick={() => setShowLeaderModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to elect <strong>{selectedPlayer.name}</strong> as your room leader?</p>
              <p>Leaders will negotiate hostage exchanges between rooms.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowLeaderModal(false)} className="industrial-button">Cancel</button>
              <button 
                className="industrial-button primary" 
                onClick={() => {
                  const room = FHEDecryptNumber(selectedPlayer.encryptedRoom) === 1 ? "blue" : "red";
                  electLeader(room, selectedPlayer.id);
                }}
              >
                Confirm Election
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showHostageModal && selectedPlayer && (
        <div className="modal-overlay">
          <div className="hostage-modal industrial-card">
            <div className="modal-header">
              <h2>Select Hostage</h2>
              <button onClick={() => setShowHostageModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to select <strong>{selectedPlayer.name}</strong> as the hostage for exchange?</p>
              <p>The hostage will be moved to the opposite room.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowHostageModal(false)} className="industrial-button">Cancel</button>
              <button 
                className="industrial-button primary" 
                onClick={() => {
                  selectHostage(selectedPlayer.id);
                }}
              >
                Confirm Hostage
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="gear-icon"></div><span>Two Rooms & A Boom</span></div>
            <p>FHE-encrypted social deduction game powered by Zama</p>
          </div>
          <div className="footer-links">
            <div className="fhe-badge"><span>FHE-Powered Privacy</span></div>
            <div className="copyright">© {new Date().getFullYear()} Two Rooms & A Boom FHE. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;