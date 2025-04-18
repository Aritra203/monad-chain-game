import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navigation from '@/components/Navigation';
import { Card as UICard } from "@/components/ui/card";
import GameCard from '@/components/GameCard';
import MonadStatus from '@/components/MonadStatus';
import ShardManager from '@/components/ShardManager';
import MonadBoostMechanic from '@/components/MonadBoostMechanic';
import GameRoomSelector from '@/components/GameRoomSelector';
import GameModeMenu from '@/components/GameModeMenu';
import GameRoomManager from '@/components/GameRoomManager';
import TurnTimer from '@/components/TurnTimer';
import GameSyncStatus from '@/components/GameSyncStatus';
import TransactionConfirmation from '@/components/TransactionConfirmation';
import GameTransactionOverlay from '@/components/GameTransactionOverlay';
import PlayerInventory from '@/components/PlayerInventory';
import BlockchainTransactionInfo, { Transaction } from '@/components/BlockchainTransactionInfo';
import TransactionLoader from '@/components/TransactionLoader';
import WebSocketService, { WebSocketMessageType } from '@/services/WebSocketService';
import GameSyncService, { GameState, ConflictResolutionStrategy } from '@/services/GameSyncService';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toast } from "sonner";
import { cards, currentPlayer, monadGameState } from '@/data/gameData';
import { Card as GameCardType, MonadGameMove, CardType, AIDifficultyTier, TierRequirement, Player as PlayerType, MovesBatch, GameMode, GameRoom } from '@/types/game';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Shield, Sword, Zap, ExternalLink } from 'lucide-react';
import { aiStrategies, selectCardNovice, selectCardVeteran, selectCardLegend, getAIThinkingMessage, enhanceAICards } from '@/data/aiStrategies';
import { monadGameService } from '@/services/MonadGameService';
import { getTransactionExplorerUrl } from '@/utils/blockchain';

const STORAGE_KEY_SHARDS = "monad_game_shards";
const STORAGE_KEY_LAST_REDEMPTION = "monad_game_last_redemption";
const STORAGE_KEY_DAILY_TRIALS = "monad_game_daily_trials";
const STORAGE_KEY_PLAYER_CARDS = "monad_game_player_cards";

const Game = () => {
  const { toast: uiToast } = useToast();
  const [playerDeck, setPlayerDeck] = useState<GameCardType[]>(currentPlayer.cards);
  const [opponentCards, setOpponentCards] = useState<GameCardType[]>([]);
  const [selectedCard, setSelectedCard] = useState<GameCardType | null>(null);
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [gameStatus, setGameStatus] = useState<'mode_select' | 'room_select' | 'gameroom' | 'inventory' | 'waiting' | 'playing' | 'end'>('mode_select');
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);

  // WebSocket and sync state
  const [wsConnected, setWsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTransactionConfirmation, setShowTransactionConfirmation] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<{
    hash: string;
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    timestamp: number;
  } | null>(null);
  const [playerMana, setPlayerMana] = useState(10);
  const [opponentMana, setOpponentMana] = useState(10);
  const [playerHealth, setPlayerHealth] = useState(20);
  const [opponentHealth, setOpponentHealth] = useState(20);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [pendingMoves, setPendingMoves] = useState<MonadGameMove[]>([]);
  const [isOnChain, setIsOnChain] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<'player' | 'opponent'>('player');
  const [fatigueDamage, setFatigueDamage] = useState(1);
  const [consecutiveSkips, setConsecutiveSkips] = useState(0);
  const [playerData, setPlayerData] = useState<PlayerType>({
    ...currentPlayer,
    shards: 0,
    dailyTrialsRemaining: 3,
    lastTrialTime: 0
  });
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficultyTier>(AIDifficultyTier.NOVICE);
  const [playerMonadBalance, setPlayerMonadBalance] = useState(1000);
  const [boostActive, setBoostActive] = useState(false);
  const [boostDetails, setBoostDetails] = useState<{
    effect: number,
    remainingTurns: number,
    stakedAmount?: number,
    powerBoost?: number,
    efficiency?: number,
    affectedCards?: string[]
  } | null>(null);
  const [allPlayerCards, setAllPlayerCards] = useState<GameCardType[]>(currentPlayer.cards);
  const [isOpponentStunned, setIsOpponentStunned] = useState(false);
  const [turnTimeExpired, setTurnTimeExpired] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [playerLastCards, setPlayerLastCards] = useState<GameCardType[]>([]);
  const [consecutiveDefenseCount, setConsecutiveDefenseCount] = useState(0);
  const [aiComboCounter, setAiComboCounter] = useState(0);
  const [isPlayerStunned, setPlayerStunned] = useState(false);

  // Blockchain transaction tracking
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<{
    txHash: string;
    description: string;
    blockNumber?: number;
  } | null>(null);
  const [blockchainStats, setBlockchainStats] = useState({
    currentBlockHeight: monadGameState.currentBlockHeight || 0,
    networkName: import.meta.env.VITE_NETWORK_NAME || 'Monad Testnet'
  });

  useEffect(() => {
    const savedShards = localStorage.getItem(STORAGE_KEY_SHARDS);
    const parsedShards = savedShards ? parseInt(savedShards, 10) : 0;

    const savedLastRedemption = localStorage.getItem(STORAGE_KEY_LAST_REDEMPTION);
    const parsedLastRedemption = savedLastRedemption ? parseInt(savedLastRedemption, 10) : 0;

    const savedDailyTrials = localStorage.getItem(STORAGE_KEY_DAILY_TRIALS);
    const parsedDailyTrials = savedDailyTrials ? parseInt(savedDailyTrials, 10) : 3;

    const savedPlayerCards = localStorage.getItem(STORAGE_KEY_PLAYER_CARDS);
    const parsedPlayerCards = savedPlayerCards ? JSON.parse(savedPlayerCards) : currentPlayer.cards;

    const isNewDay = new Date(parsedLastRedemption).getDate() !== new Date().getDate() ||
                     new Date(parsedLastRedemption).getMonth() !== new Date().getMonth() ||
                     new Date(parsedLastRedemption).getFullYear() !== new Date().getFullYear();

    const dailyTrialsToSet = isNewDay ? 3 : parsedDailyTrials;

    setPlayerData(prev => ({
      ...prev,
      shards: parsedShards,
      lastTrialTime: parsedLastRedemption,
      dailyTrialsRemaining: dailyTrialsToSet
    }));

    setAllPlayerCards(parsedPlayerCards);

    setIsOnChain(monadGameState.isOnChain && monadGameState.networkStatus === 'connected');
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHARDS, playerData.shards.toString());
    if (playerData.lastTrialTime) {
      localStorage.setItem(STORAGE_KEY_LAST_REDEMPTION, playerData.lastTrialTime.toString());
    }
    localStorage.setItem(STORAGE_KEY_DAILY_TRIALS, playerData.dailyTrialsRemaining.toString());
  }, [playerData.shards, playerData.lastTrialTime, playerData.dailyTrialsRemaining]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PLAYER_CARDS, JSON.stringify(allPlayerCards));
  }, [allPlayerCards]);

  useEffect(() => {
    const initializeBlockchain = async () => {
        try {
            // Connect wallet
            const address = await monadGameService.connectWallet();
            setWalletAddress(address);
            setWalletConnected(true);

            // Check if player is registered
            try {
                const playerData = await monadGameService.getPlayerData(address);
                // If we get here without an error, the player is registered
                console.log('Player data retrieved:', playerData);
                setIsRegistered(true);
            } catch (error) {
                console.log('Player not registered yet:', error);
                // For development purposes, we'll auto-register the player
                // This makes testing easier
                if (process.env.NODE_ENV === 'development') {
                    try {
                        console.log('Auto-registering player in development mode');
                        await monadGameService.registerPlayer();
                        setIsRegistered(true);
                    } catch (regError) {
                        console.error('Auto-registration failed:', regError);
                        // Continue without registration
                    }
                } else {
                    setIsRegistered(false);
                }
            }

            // Initialize WebSocket connection
            const wsService = WebSocketService.getInstance();
            const syncService = GameSyncService.getInstance();

            // Set up WebSocket connection listeners
            wsService.addConnectionStatusListener((connected) => {
              setWsConnected(connected);
              if (connected) {
                toast.success("Connected to game server", {
                  description: "Real-time updates enabled"
                });
              } else {
                toast.error("Disconnected from game server", {
                  description: "Attempting to reconnect..."
                });
              }
            });

            // Set up sync status listeners
            syncService.addSyncStatusListener((syncing) => {
              setIsSyncing(syncing);
            });

            // Set up transaction update listeners
            syncService.addTransactionUpdateListener((update) => {
              setTransactionDetails({
                hash: update.transactionHash,
                status: update.status,
                blockNumber: update.blockNumber,
                timestamp: update.timestamp
              });

              if (update.status === 'confirmed') {
                setShowTransactionConfirmation(true);
                // Auto-hide after 5 seconds
                setTimeout(() => setShowTransactionConfirmation(false), 5000);
              }
            });

            // Connect to WebSocket server
            wsService.connect(address || 'anonymous');
        } catch (error) {
            console.error("Blockchain initialization error:", error);
            toast.error("Failed to connect to blockchain");
        }
    };

    initializeBlockchain();

    // Clean up on unmount
    return () => {
      const wsService = WebSocketService.getInstance();
      wsService.disconnect();
    };
  }, []);

  const getPlayableCards = useCallback((cards: GameCardType[], mana: number) => {
    return cards.filter(card => card.mana <= mana);
  }, []);

  const handleSelectGameMode = (mode: GameMode) => {
    setGameMode(mode);

    if (mode === GameMode.PRACTICE) {
      setGameStatus('room_select');
      toast.success("Practice Mode Selected", {
        description: "Choose a difficulty level to practice against AI"
      });
    } else if (mode === GameMode.GAMEROOM) {
      setGameStatus('gameroom');
      toast.success("Game Room Mode Selected", {
        description: "Create or join a room to play against a friend"
      });
    }
  };

  const handleRoomCreated = (room: GameRoom) => {
    setCurrentRoom(room);
    // Room creation is handled by the GameRoomManager component
  };

  const handleGameRoomStart = () => {
    // When a game starts in game room mode
    resetGame();
    setGameStatus('playing');
    setCurrentTurn('player');
    setBattleLog(['1v1 Battle has begun on the MONAD blockchain! Your turn.']);

    toast.success("Game Started", {
      description: "The 1v1 battle has begun! Play your first card."
    });
  };

  const backToModeSelection = () => {
    setGameStatus('mode_select');
    setGameMode(null);
    setCurrentRoom(null);
    setOpponentCards([]);
  };

  useEffect(() => {
    if (gameStatus !== 'playing') return;

    if (currentTurn === 'player') {
      const playableCards = getPlayableCards(playerDeck, playerMana);
      if (playableCards.length === 0 && playerDeck.length > 0) {
        handleNoPlayableCards('player', 'No playable cards available. Turn passed to opponent.');
      } else if (playerDeck.length === 0) {
        handleFatigue('player');
      }
    }
  }, [currentTurn, playerDeck, playerMana, gameStatus, getPlayableCards]);

  const handleSelectDifficulty = (difficulty: AIDifficultyTier) => {
    setAiDifficulty(difficulty);

    let opponentCardPool: GameCardType[];

    // Filter cards based on difficulty
    switch (difficulty) {
      case AIDifficultyTier.NOVICE:
        // Novice only gets common and rare cards
        opponentCardPool = cards.filter(card => card.rarity !== 'epic' && card.rarity !== 'legendary');
        break;

      case AIDifficultyTier.VETERAN:
        // Veteran gets everything except legendary cards
        opponentCardPool = cards.filter(card => card.rarity !== 'legendary');
        break;

      case AIDifficultyTier.LEGEND:
        // Legend gets all cards
        opponentCardPool = [...cards];
        break;

      default:
        opponentCardPool = [...cards];
    }

    // Apply difficulty-specific enhancements to the cards
    opponentCardPool = enhanceAICards(opponentCardPool, difficulty);

    const randomCards: GameCardType[] = [];
    while (randomCards.length < 3 && opponentCardPool.length > 0) {
      const randomIndex = Math.floor(Math.random() * opponentCardPool.length);
      randomCards.push(opponentCardPool[randomIndex]);
      opponentCardPool.splice(randomIndex, 1);
    }

    setOpponentCards(randomCards);

    // Instead of going to waiting screen, go to inventory for card selection
    setGameStatus('inventory');

    let difficultyName = '';
    let description = '';

    switch (difficulty) {
      case AIDifficultyTier.NOVICE:
        difficultyName = 'Novice';
        description = 'Perfect for beginners. Learn the basics of Monad battles.';
        break;
      case AIDifficultyTier.VETERAN:
        difficultyName = 'Veteran';
        description = 'For experienced players. Face smarter opponents.';
        break;
      case AIDifficultyTier.LEGEND:
        difficultyName = 'Legend';
        description = 'For masters only. Face the ultimate challenge.';
        break;
    }

    toast.success(`Entered ${difficultyName} Room`, {
      description: `${description} Select your cards to begin.`
    });
  };

  const openInventory = () => {
    setGameStatus('inventory');
  };

  const closeInventory = () => {
    // If we came from room selection, go back to room selection
    if (opponentCards.length === 0) {
      setGameStatus('room_select');
    } else {
      // Otherwise go to waiting screen
      setGameStatus('waiting');
    }
  };

  const handleCardSelection = (selectedCards: GameCardType[]) => {
    setPlayerDeck(selectedCards);
    setGameStatus('waiting');

    toast.success("Deck Selected", {
      description: `You've selected ${selectedCards.length} cards for battle.`
    });
  };

  const startGame = () => {
    resetGame();
    setGameStatus('playing');
    setCurrentTurn('player');
    setBattleLog(['Battle has begun on the MONAD blockchain! Your turn.']);

    if (gameMode === GameMode.PRACTICE) {
      let difficultyMessage = "";
      switch (aiDifficulty) {
        case AIDifficultyTier.NOVICE:
          difficultyMessage = "Novice training battle begins. Perfect your strategy!";
          break;
        case AIDifficultyTier.VETERAN:
          difficultyMessage = "Veteran AI activated. This opponent has advanced tactics!";
          break;
        case AIDifficultyTier.LEGEND:
          difficultyMessage = "LEGENDARY AI ENGAGED! Prepare for the ultimate challenge!";
          break;
      }

      setBattleLog(prev => [...prev, difficultyMessage]);
    }

    uiToast({
      title: "Game Started",
      description: "The battle has begun! Play your first card.",
    });

    toast.success("Connected to MONAD blockchain", {
      description: `Current block: ${monadGameState.currentBlockHeight}`,
      duration: 3000,
    });
  };

  const handleBoostActivation = async (amount: number, boostEffect: number, duration: number) => {
    // Show transaction pending state
    setIsTransactionPending(true);
    const txHash = `0x${Math.random().toString(16).substring(2, 42)}`; // Simulated hash

    setCurrentTransaction({
      txHash,
      description: `Activating MONAD Boost: +${boostEffect}% power`,
      blockNumber: blockchainStats.currentBlockHeight
    });

    toast.loading("Activating MONAD Boost on blockchain...", {
      id: txHash,
      duration: 3000,
    });

    try {
      // Simulate blockchain transaction
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Apply boost to all cards
      setPlayerDeck(prevCards =>
        prevCards.map(card => ({
          ...card,
          originalAttack: card.attack,
          originalDefense: card.defense,
          originalSpecial: card.special,
          attack: card.attack ? Math.floor(card.attack * (1 + boostEffect / 100)) : undefined,
          defense: card.defense ? Math.floor(card.defense * (1 + boostEffect / 100)) : undefined,
          special: card.special ? Math.floor(card.special * (1 + boostEffect / 100)) : undefined,
          boosted: true,
        }))
      );

      setBoostActive(true);
      setBoostDetails({
        effect: boostEffect,
        remainingTurns: duration,
        stakedAmount: amount,
        powerBoost: boostEffect,
        efficiency: Math.min(200, 100 + (amount * 2)),
        affectedCards: playerDeck.map(card => card.id)
      });

      setPlayerMonadBalance(prev => prev - amount);

      // Add visual effects
      setBattleLog(prev => [...prev, `🔥 MONAD Boost activated! +${boostEffect}% power for ${duration} turns`]);

      // Update transaction status
      const newTransaction: Transaction = {
        txHash,
        status: 'confirmed',
        blockNumber: blockchainStats.currentBlockHeight + 1,
        timestamp: Date.now(),
        description: `MONAD Boost: +${boostEffect}% for ${duration} turns`
      };

      setTransactions(prev => [newTransaction, ...prev].slice(0, 5));
      setIsTransactionPending(false);
      setCurrentTransaction(null);

      // Show success toast with animated sparkles
      toast.success(
        <div className="flex items-center">
          <span className="mr-2">MONAD Boost Activated!</span>
          <span className="text-yellow-400 animate-pulse">✨</span>
        </div>,
        {
          id: txHash,
          description: `All cards powered up by ${boostEffect}% for ${duration} turns`,
        }
      );

      // Play boost sound effect
      const audio = new Audio('/sounds/boost.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed:', e));

    } catch (error) {
      console.error("Failed to activate MONAD boost:", error);
      toast.error("Failed to activate MONAD boost");
      setIsTransactionPending(false);
      setCurrentTransaction(null);
    }
  };

  function handleOpponentTurn() {
    console.log("Executing AI turn...");
    if (gameStatus !== 'playing') return;

    // Check if opponent is stunned
    if (isOpponentStunned) {
      setBattleLog(prev => [...prev, "Opponent is stunned and skips their turn!"]);
      setIsOpponentStunned(false); // Reset stun after one turn
      endTurn('player'); // Player gets another turn
      return;
    }

    const playableCards = opponentCards.filter(card => card.mana <= opponentMana);
    console.log("AI playable cards:", playableCards);

    if (playableCards.length > 0) {
      let cardToPlay: GameCardType;
      let aiThinkingDelay = aiStrategies[aiDifficulty].thinkingTime;

      // Add AI thinking message to battle log
      const thinkingMessage = getAIThinkingMessage(aiDifficulty);
      setBattleLog(prev => [...prev, thinkingMessage]);

      // Select card based on difficulty
      switch (aiDifficulty) {
        case AIDifficultyTier.NOVICE:
          // Novice AI uses random selection
          cardToPlay = selectCardNovice(playableCards, playerHealth, opponentHealth);
          break;

        case AIDifficultyTier.VETERAN:
          // Veteran AI uses value-based selection
          cardToPlay = selectCardVeteran(playableCards, playerHealth, opponentHealth, opponentMana);
          break;

        case AIDifficultyTier.LEGEND:
          // Legend AI uses situational strategy
          cardToPlay = selectCardLegend(
            playableCards,
            playerHealth,
            opponentHealth,
            opponentMana,
            playerDeck,
            selectedCard // Pass the player's last played card
          );
          break;

        default:
          cardToPlay = playableCards[Math.floor(Math.random() * playableCards.length)];
      }

      setTimeout(() => {
        console.log("AI playing card:", cardToPlay);

        setOpponentMana(prev => prev - cardToPlay.mana);
        setOpponentCards(prev => prev.filter(c => c.id !== cardToPlay.id));

        let newPlayerHealth = playerHealth;
        let newOpponentHealth = opponentHealth;
        let logEntry = `Opponent played ${cardToPlay.name}.`;

        if (cardToPlay.attack) {
          newPlayerHealth = Math.max(0, playerHealth - cardToPlay.attack);
          logEntry += ` Dealt ${cardToPlay.attack} damage.`;
        }

        if (cardToPlay.defense) {
          newOpponentHealth = Math.min(30, opponentHealth + cardToPlay.defense);
          logEntry += ` Gained ${cardToPlay.defense} health.`;
        }

        setPlayerHealth(newPlayerHealth);
        setOpponentHealth(newOpponentHealth);
        setBattleLog(prev => [...prev, logEntry]);

        if (newPlayerHealth <= 0) {
          endGame(false);
          return;
        }

        endTurn('player');
      }, aiThinkingDelay);
    } else if (opponentCards.length === 0) {
      handleFatigue('opponent');
    } else {
      setBattleLog(prev => [...prev, "Opponent passes (no playable cards)"]);
      endTurn('player');
    }
  }

  const endTurn = useCallback((nextPlayer: 'player' | 'opponent') => {
    if (boostActive && boostDetails) {
      const newTurnsLeft = boostDetails.remainingTurns - 1;

      if (newTurnsLeft <= 0) {
        setPlayerDeck(prevCards =>
          prevCards.map(card => ({
            ...card,
            attack: card.originalAttack,
            defense: card.originalDefense,
            special: card.originalSpecial,
            boosted: false,
          }))
        );
        setBoostActive(false);
        setBoostDetails(null);
        setBattleLog(prev => [...prev, "MONAD Boost expired - cards returned to normal"]);
      } else {
        setBoostDetails(prev => ({
          ...prev!,
          remainingTurns: newTurnsLeft
        }));
        if (newTurnsLeft === 1) {
          setBattleLog(prev => [...prev, "MONAD Boost will expire next turn!"]);
        }
      }
    }

    setCurrentTurn(nextPlayer);

    if (nextPlayer === 'player') {
      setPlayerMana(prev => Math.min(10, prev + 1));
    } else {
      setOpponentMana(prev => Math.min(10, prev + 1));
    }

    setSelectedCard(null);

    if (nextPlayer === 'opponent') {
      console.log("Triggering AI turn...");
      setTimeout(handleOpponentTurn, 1000);
    }
  }, [boostActive, boostDetails]);

  useEffect(() => {
    if (gameStatus === 'playing' && currentTurn === 'opponent' && gameMode === GameMode.PRACTICE) {
      handleOpponentTurn();
    }
  }, [currentTurn, gameStatus, gameMode]);

  const handleNoPlayableCards = (player: 'player' | 'opponent', message: string) => {
    const newLogs = [...battleLog, message];
    setBattleLog(newLogs);

    if (player === 'player') {
      endTurn('opponent');
    } else {
      endTurn('player');
    }
  };

  const handleTurnTimeExpired = () => {
    // When the turn timer expires, automatically end the player's turn
    if (currentTurn === 'player' && gameStatus === 'playing') {
      const message = "Turn time expired! Your turn has ended.";
      setBattleLog(prev => [...prev, message]);
      toast.warning("Turn time expired", {
        description: "Your turn has automatically ended"
      });
      setTurnTimeExpired(true);
      endTurn('opponent');
    }
  };

  const handleFatigue = (target: 'player' | 'opponent') => {
    const damage = fatigueDamage;
    const message = `${target === 'player' ? 'You take' : 'Opponent takes'} ${damage} fatigue damage.`;

    if (target === 'player') {
        const newHealth = Math.max(0, playerHealth - damage);
        setPlayerHealth(newHealth);
        if (newHealth <= 0) {
            setBattleLog(prev => [...prev, message]);
            endGame(false);
            return;
        }
    } else {
        const newHealth = Math.max(0, opponentHealth - damage);
        setOpponentHealth(newHealth);
        if (newHealth <= 0) {
            setBattleLog(prev => [...prev, message]);
            endGame(true);
            return;
        }
    }

    setBattleLog(prev => [...prev, message]);
    setFatigueDamage(prev => prev + 1);
    setConsecutiveSkips(prev => prev + 1);

    // Only check for draw after 3 consecutive skips
    if (consecutiveSkips >= 2) { // Changed from 3 to 2 since we increment before checking
        endGame(null);
        return;
    }

    endTurn(target === 'player' ? 'opponent' : 'player');
  };

  const playCard = async (card: GameCardType) => {
    if (!walletConnected || !isRegistered) {
        toast.error("Please connect wallet and register first");
        return;
    }

    if (gameStatus !== 'playing' || currentTurn !== 'player') {
      toast.warning("Not your turn!");
      return;
    }

    if (playerMana < card.mana) {
      toast.warning(`Not enough mana (Need ${card.mana}, have ${playerMana})`);
      return;
    }

    try {
        // Generate a unique game ID for this move
        const gameId = Date.now();

        const newMove: MonadGameMove = {
            gameId,
            moveId: `move-${gameId}`,
            playerAddress: walletAddress,
            cardId: card.id,
            moveType: card.type.toLowerCase() as 'attack' | 'defend' | 'special',
            timestamp: Date.now(),
            verified: false
        };

        // Show transaction pending state
        setIsTransactionPending(true);

        // Visual feedback for transaction - use a temporary ID for the toast
        const tempToastId = `move-${Date.now()}`;
        toast.loading("Submitting move to MONAD blockchain...", {
            id: tempToastId,
            duration: 10000, // Longer duration since we're waiting for actual blockchain confirmation
        });

        // Submit move to blockchain - this will return the actual transaction hash
        const result = await monadGameService.executeParallelMoves([newMove]);
        const txHash = result.txHash;
        const blockNumber = result.blockNumber;

        // Set the current transaction with the real transaction hash
        setCurrentTransaction({
            txHash,
            description: `Playing card: ${card.name}`,
            blockNumber: blockNumber
        });

        // Update transaction status with the real transaction data
        const newTransaction: Transaction = {
            txHash,
            status: 'confirmed',
            blockNumber: blockNumber,
            timestamp: Date.now(),
            description: `Played ${card.name} (${card.type})`
        };

        setTransactions(prev => [newTransaction, ...prev].slice(0, 5));
        setIsTransactionPending(false);
        setCurrentTransaction(null);

        // Update the toast with the real transaction hash
        toast.success("Move confirmed on MONAD blockchain", {
            id: tempToastId,
            description: `Transaction hash: ${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
        });

        // Add a button to view the transaction in the explorer
        const explorerUrl = getTransactionExplorerUrl(txHash);
        console.log('Explorer URL for transaction:', explorerUrl);
        toast.success(
          <div className="flex flex-col space-y-2">
            <span>View transaction on MONAD Explorer</span>
            <button
              onClick={() => {
                console.log('Opening explorer URL:', explorerUrl);
                window.open(explorerUrl, '_blank');
              }}
              className="text-xs bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400 py-1 px-2 rounded flex items-center justify-center"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Explorer
            </button>
          </div>,
          {
            duration: 5000,
          }
        );

        setPlayerMana(prev => prev - card.mana);
        setPlayerDeck(prev => prev.filter(c => c.id !== card.id));
        setSelectedCard(card);
        setPlayerLastCards(prev => [card, ...prev].slice(0, 3));

        let logEntry = `You played ${card.name}.`;
        let opponentNewHealth = opponentHealth;
        let playerNewHealth = playerHealth;
        let extraMana = 0;
        let applyStun = false;

        // Apply card effects based on type
        if (card.attack) {
          // Calculate damage with potential critical hit for higher rarity cards
          let damage = card.attack;
          let criticalHit = false;
          let boostBonus = 0;

          // Add boost effect message if card is boosted
          if (card.boosted && card.originalAttack) {
            boostBonus = card.attack - card.originalAttack;
          }

          // Critical hit chance based on card rarity
          if (card.rarity === 'epic' && Math.random() < 0.2) {
            damage = Math.floor(damage * 1.5);
            criticalHit = true;
          } else if (card.rarity === 'legendary' && Math.random() < 0.3) {
            damage = Math.floor(damage * 2);
            criticalHit = true;
          }

          opponentNewHealth = Math.max(0, opponentHealth - damage);

          if (criticalHit && boostBonus > 0) {
            logEntry += ` CRITICAL HIT + MONAD BOOST! Dealt ${damage} damage (includes +${boostBonus} from boost).`;
          } else if (criticalHit) {
            logEntry += ` CRITICAL HIT! Dealt ${damage} damage.`;
          } else if (boostBonus > 0) {
            logEntry += ` Dealt ${damage} damage (includes +${boostBonus} from MONAD boost).`;
          } else {
            logEntry += ` Dealt ${damage} damage.`;
          }

          // Visual effect for boosted attacks
          if (boostBonus > 0) {
            toast("MONAD Boost Applied", {
              description: `+${boostBonus} attack power from MONAD boost`,
              icon: "✨",
              duration: 2000,
            });
          }
        }

        if (card.defense) {
          // Healing is more effective at lower health (comeback mechanic)
          let healing = card.defense;
          let boostBonus = 0;
          let lowHealthBonus = 0;

          // Add boost effect message if card is boosted
          if (card.boosted && card.originalDefense) {
            boostBonus = card.defense - card.originalDefense;
          }

          // Low health bonus
          if (playerHealth < 10) {
            lowHealthBonus = Math.floor(healing * 0.3); // 30% bonus when low on health
            healing = healing + lowHealthBonus;
          }

          playerNewHealth = Math.min(30, playerHealth + healing);

          if (lowHealthBonus > 0 && boostBonus > 0) {
            logEntry += ` Enhanced healing + MONAD BOOST! Gained ${healing} health (includes +${boostBonus} from boost and +${lowHealthBonus} from low health bonus).`;
          } else if (lowHealthBonus > 0) {
            logEntry += ` Enhanced healing! Gained ${healing} health (includes +${lowHealthBonus} from low health bonus).`;
          } else if (boostBonus > 0) {
            logEntry += ` Gained ${healing} health (includes +${boostBonus} from MONAD boost).`;
          } else {
            logEntry += ` Gained ${healing} health.`;
          }

          // Visual effect for boosted healing
          if (boostBonus > 0) {
            toast("MONAD Boost Applied", {
              description: `+${boostBonus} healing power from MONAD boost`,
              icon: "✨",
              duration: 2000,
            });
          }
        }

        // Handle special effects with expanded functionality
        if (card.specialEffect) {
          logEntry += ` ${card.specialEffect.description}`;

          // Check if special effect is boosted
          let specialBoostBonus = 0;
          if (card.boosted && card.originalSpecial && card.special) {
            specialBoostBonus = card.special - card.originalSpecial;
          }

          switch (card.specialEffect.type) {
            case 'damage':
              if (card.specialEffect.value) {
                // Apply boost to special damage if applicable
                let specialDamage = card.specialEffect.value;
                if (specialBoostBonus > 0 && card.special) {
                  // Scale the special effect damage by the boost percentage
                  const boostMultiplier = card.special / (card.originalSpecial || 1);
                  specialDamage = Math.floor(specialDamage * boostMultiplier);
                }

                opponentNewHealth = Math.max(0, opponentNewHealth - specialDamage);

                if (specialBoostBonus > 0) {
                  logEntry += ` (${specialDamage} extra damage, MONAD boosted)`;

                  // Visual effect for boosted special
                  toast("MONAD Special Boost", {
                    description: `Special effect amplified by MONAD boost`,
                    icon: "✨",
                    duration: 2000,
                  });
                } else {
                  logEntry += ` (${specialDamage} extra damage)`;
                }
              }
              break;

            case 'heal':
              if (card.specialEffect.value) {
                // Apply boost to special healing if applicable
                let specialHealing = card.specialEffect.value;
                if (specialBoostBonus > 0 && card.special) {
                  // Scale the special effect healing by the boost percentage
                  const boostMultiplier = card.special / (card.originalSpecial || 1);
                  specialHealing = Math.floor(specialHealing * boostMultiplier);
                }

                playerNewHealth = Math.min(30, playerNewHealth + specialHealing);

                if (specialBoostBonus > 0) {
                  logEntry += ` (${specialHealing} extra healing, MONAD boosted)`;

                  // Visual effect for boosted special
                  toast("MONAD Special Boost", {
                    description: `Healing effect amplified by MONAD boost`,
                    icon: "✨",
                    duration: 2000,
                  });
                } else {
                  logEntry += ` (${specialHealing} extra healing)`;
                }
              }
              break;

            case 'mana':
              if (card.specialEffect.value) {
                // Apply boost to mana gain if applicable
                extraMana = card.specialEffect.value;
                if (specialBoostBonus > 0 && card.special) {
                  // Add a bonus mana for boosted cards
                  extraMana += 1;
                  logEntry += ` (Gained ${extraMana} extra mana, +1 from MONAD boost)`;

                  // Visual effect for boosted special
                  toast("MONAD Special Boost", {
                    description: `Mana gain amplified by MONAD boost`,
                    icon: "✨",
                    duration: 2000,
                  });
                } else {
                  logEntry += ` (Gained ${extraMana} extra mana)`;
                }
              }
              break;

            case 'stun':
              applyStun = true;

              // Boosted stun cards have a chance to stun for an extra turn
              if (specialBoostBonus > 0 && Math.random() < 0.5) {
                logEntry += ` (Opponent stunned for 2 turns, enhanced by MONAD boost)`;
                // We'll need to handle the extended stun in the game logic

                // Visual effect for boosted special
                toast("MONAD Special Boost", {
                  description: `Stun effect amplified by MONAD boost`,
                  icon: "✨",
                  duration: 2000,
                });
              } else {
                logEntry += ` (Opponent stunned for 1 turn)`;
              }
              break;

            case 'leech':
              if (card.specialEffect.value && card.attack) {
                // Leech life equal to a percentage of damage dealt
                const leechAmount = Math.floor(card.attack * (card.specialEffect.value / 100));
                playerNewHealth = Math.min(30, playerNewHealth + leechAmount);
                logEntry += ` (Leeched ${leechAmount} health)`;
              }
              break;
          }

          // Handle effect types for more complex mechanics
          switch (card.specialEffect.effectType) {
            case 'COMBO':
              // Combo cards get stronger if played after certain other cards
              if (card.specialEffect.comboWith && pendingMoves.length > 0) {
                const lastMove = pendingMoves[pendingMoves.length - 1];
                if (card.specialEffect.comboWith.includes(lastMove.cardId)) {
                  // Bonus damage for combo
                  opponentNewHealth = Math.max(0, opponentNewHealth - 3);
                  logEntry += ` (COMBO BONUS: +3 damage)`;
                }
              }
              break;

            case 'COUNTER':
              // Counter cards are more effective against certain types
              // This would need to track the opponent's last card
              break;
          }
        }

        setOpponentHealth(opponentNewHealth);
        setPlayerHealth(playerNewHealth);
        setBattleLog(prev => [...prev, logEntry]);
        setPendingMoves(prev => [...prev, newMove]);

        // Reset consecutive skips counter when a card is played
        setConsecutiveSkips(0);

        // Apply extra mana if card granted it
        if (extraMana > 0) {
          setPlayerMana(prev => Math.min(10, prev + extraMana));
        }

        // Apply stun effect if card has it
        if (applyStun) {
          setIsOpponentStunned(true);
        }

        toast.loading("Submitting move to MONAD blockchain...", {
          id: newMove.moveId,
          duration: 2000,
        });

        // Update the move with the real transaction data
        setPendingMoves(prev =>
          prev.map(m => m.moveId === newMove.moveId ? {
            ...m,
            verified: true,
            onChainSignature: txHash
          } : m)
        );

        toast.success("Move verified on-chain", {
          id: newMove.moveId,
          description: `Block: ${blockNumber}`,
        });

          if (opponentNewHealth <= 0) {
            endGame(true);
            return;
          }

          // If opponent is stunned, they skip their turn
          if (isOpponentStunned) {
            setBattleLog(prev => [...prev, "Opponent is stunned and skips their turn!"]);
            setIsOpponentStunned(false); // Reset stun after one turn
            endTurn('player'); // Player gets another turn
          } else {
            endTurn('opponent');
          }
    } catch (error) {
        console.error("Failed to submit move:", error);
        toast.error("Failed to submit move to blockchain");
        return;
    }
  };

  const getShardReward = () => {
    switch (aiDifficulty) {
      case AIDifficultyTier.NOVICE:
        return 1;
      case AIDifficultyTier.VETERAN:
        return 3;
      case AIDifficultyTier.LEGEND:
        return 5;
      default:
        return 1;
    }
  };

  const handleShardRedemption = async () => {
    if (!walletConnected || !isRegistered) {
        toast.error("Please connect wallet and register first");
        return;
    }

    try {
        await monadGameService.redeemNFT();
        // ... rest of your existing redemption logic ...
    } catch (error) {
        console.error("NFT redemption failed:", error);
        toast.error("Failed to redeem NFT");
    }
  };

  const endGame = async (playerWon: boolean | null) => {
    try {
        // Show transaction pending state
        setIsTransactionPending(true);

        // Use a temporary toast ID
        const tempToastId = `game-end-${Date.now()}`;
        toast.loading("Finalizing game on MONAD blockchain...", {
            id: tempToastId,
            duration: 15000, // Longer duration for blockchain confirmation
        });

        const gameId = Date.now();
        // Game result data for blockchain submission
        const gameResult = {
            gameId,
            winner: playerWon ? walletAddress : null,
            playerHealth: playerHealth,
            opponentHealth: opponentHealth,
            difficulty: aiDifficulty,
            moves: pendingMoves
        };

        const movesBatch: MovesBatch = {
            gameId,
            batchId: `batch-${gameId}`,
            moves: pendingMoves,
            stateRoot: "0x" + Math.random().toString(16).slice(2),
            zkProof: "0x" + Math.random().toString(16).slice(2),
            verificationTime: Date.now(),
            submittedInBlock: blockchainStats.currentBlockHeight
        };

        // Submit the batch to the blockchain and get the real transaction hash
        const batchResult = await monadGameService.submitMovesBatch(movesBatch);
        const txHash = batchResult.txHash;
        const blockNumber = batchResult.blockNumber;

        // Set the current transaction with real data
        setCurrentTransaction({
            txHash,
            description: playerWon ? 'Recording victory on chain' : playerWon === false ? 'Recording defeat on chain' : 'Recording draw on chain',
            blockNumber: blockNumber
        });

        // Update transaction status with real data
        const newTransaction: Transaction = {
            txHash,
            status: 'confirmed',
            blockNumber: blockNumber,
            timestamp: Date.now(),
            description: playerWon
                ? 'Victory recorded on MONAD blockchain'
                : playerWon === false
                ? 'Defeat recorded on MONAD blockchain'
                : 'Draw recorded on MONAD blockchain'
        };

        setTransactions(prev => [newTransaction, ...prev].slice(0, 5));

        // Update the toast with the real transaction hash
        toast.success("Game results recorded on MONAD blockchain", {
            id: tempToastId,
            description: `Transaction hash: ${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
        });

        // Add a button to view the transaction in the explorer
        const explorerUrl = getTransactionExplorerUrl(txHash);
        toast.success(
          <div className="flex flex-col space-y-2">
            <span>View game results on MONAD Explorer</span>
            <button
              onClick={() => {
                console.log('Opening explorer URL:', explorerUrl);
                window.open(explorerUrl, '_blank');
              }}
              className="text-xs bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400 py-1 px-2 rounded flex items-center justify-center"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Explorer
            </button>
          </div>,
          {
            duration: 5000,
          }
        );

        // Award shards
        if (playerWon) {
            const shardReward = getShardReward();

            // Submit game result and claim shards - get real transaction data
            const shardResult = await monadGameService.claimShards(movesBatch.batchId, gameResult);
            const shardTxHash = shardResult.txHash;
            const shardBlockNumber = shardResult.blockNumber;

            // Add shard transaction with real data
            const shardTransaction: Transaction = {
                txHash: shardTxHash,
                status: 'confirmed',
                blockNumber: shardBlockNumber,
                timestamp: Date.now(),
                description: `Claimed ${shardReward} MONAD shards as reward`
            };

            setTransactions(prev => [shardTransaction, ...prev].slice(0, 5));

            // Update player's MONAD balance
            setPlayerMonadBalance(prev => prev + shardReward);

            toast.success(`Earned ${shardReward} MONAD shards!`, {
                description: "Shards added to your inventory"
            });

            // Add a button to view the shard transaction in the explorer
            const shardExplorerUrl = getTransactionExplorerUrl(shardTxHash);
            toast.success(
              <div className="flex flex-col space-y-2">
                <span>View shard claim on MONAD Explorer</span>
                <button
                  onClick={() => {
                    console.log('Opening explorer URL:', shardExplorerUrl);
                    window.open(shardExplorerUrl, '_blank');
                  }}
                  className="text-xs bg-amber-900/50 hover:bg-amber-800/50 text-amber-400 py-1 px-2 rounded flex items-center justify-center"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open Explorer
                </button>
              </div>,
              {
                duration: 5000,
              }
            );
        }

        setIsTransactionPending(false);
        setCurrentTransaction(null);

    } catch (error) {
        console.error("Failed to record game result:", error);
        toast.error("Failed to record game result on blockchain");
        setIsTransactionPending(false);
        setCurrentTransaction(null);
    }

    setGameStatus('end');
  };

  const resetGame = () => {
    // Don't reset player deck - use the one they selected
    // Only reset if they haven't selected any cards
    if (playerDeck.length === 0) {
      setPlayerDeck(allPlayerCards.slice(0, 3));
    }
    setSelectedCard(null);
    setPlayerMana(10);
    setOpponentMana(10);
    setPlayerHealth(20);
    setOpponentHealth(20);
    setBattleLog([]);
    setPendingMoves([]);
    setCurrentTurn('player');
    setFatigueDamage(1);
    setConsecutiveSkips(0);
    setBoostActive(false);
    setBoostDetails(null);
    setIsOpponentStunned(false);
  };

  const backToRoomSelection = () => {
    if (gameMode === GameMode.PRACTICE) {
      setGameStatus('room_select');
    } else if (gameMode === GameMode.GAMEROOM) {
      setGameStatus('gameroom');
    } else {
      setGameStatus('mode_select');
    }
    setBattleLog([]);
  };

  const renderManaExplanation = () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="text-xs text-blue-400 underline cursor-help">
          What is Mana?
        </TooltipTrigger>
        <TooltipContent className="w-80 p-3 bg-black/90 border border-blue-500/30">
          <div>
            <h4 className="font-bold text-blue-400 mb-1">MONAD Mana System</h4>
            <p className="text-xs text-white/80">
              Mana is the energy resource that powers your cards. Each card requires a specific amount
              of mana to play. You start with 10 mana and gain +1 mana each turn (up to a maximum of 10).
              Strategic mana management is key to victory!
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const renderGameContent = () => {
    if (!walletConnected) {
        return (
            <UICard className="glassmorphism border-emerald-500/30 p-6 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
                <Button
                    onClick={() => monadGameService.connectWallet()}
                    className="bg-gradient-to-r from-emerald-400 to-teal-500"
                >
                    Connect MetaMask
                </Button>
            </UICard>
        );
    }

    if (!isRegistered) {
        return (
            <UICard className="glassmorphism border-emerald-500/30 p-6 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Register to Play</h2>
                <p className="text-gray-400 mb-6">Register your wallet to start playing Monad Chain Game</p>
                <Button
                    onClick={async () => {
                        // Disable the button to prevent multiple clicks
                        const button = document.activeElement as HTMLButtonElement;
                        if (button) button.disabled = true;

                        const toastId = "register-player-toast";
                        toast.loading("Registering player on Monad blockchain...", { id: toastId });

                        try {
                            // Call the service to register the player - get the real transaction hash
                            const result = await monadGameService.registerPlayer();
                            const txHash = result.txHash;

                            // Registration successful
                            toast.success("Successfully registered!", {
                                id: toastId,
                                description: `Transaction hash: ${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
                            });

                            // Add a button to view the transaction in the explorer
                            const explorerUrl = getTransactionExplorerUrl(txHash);
                            toast.success(
                              <div className="flex flex-col space-y-2">
                                <span>View registration on MONAD Explorer</span>
                                <button
                                  onClick={() => {
                                    console.log('Opening explorer URL:', explorerUrl);
                                    window.open(explorerUrl, '_blank');
                                  }}
                                  className="text-xs bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-400 py-1 px-2 rounded flex items-center justify-center"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Open Explorer
                                </button>
                              </div>,
                              {
                                duration: 5000,
                              }
                            );

                            // Update the UI state
                            setIsRegistered(true);
                        } catch (error: any) {
                            console.error("Registration failed:", error);

                            // If there was an error, show it to the user
                            const errorMessage = error.message || "Failed to register. Please try again.";
                            toast.error("Registration failed", {
                                id: toastId,
                                description: errorMessage
                            });

                            // Re-enable the button
                            if (button) button.disabled = false;
                        }
                    }}
                    className="bg-gradient-to-r from-emerald-400 to-teal-500"
                >
                    Register Player
                </Button>
            </UICard>
        );
    }

    switch (gameStatus) {
      case 'mode_select':
        return <GameModeMenu onSelectMode={handleSelectGameMode} />;

      case 'room_select':
        return (
          <div className="space-y-4">
            <GameRoomSelector onSelectDifficulty={handleSelectDifficulty} />

            <div className="flex justify-center">
              <Button
                variant="ghost"
                className="text-xs text-gray-400 hover:text-white"
                onClick={backToModeSelection}
              >
                Back to Game Modes
              </Button>
            </div>
          </div>
        );

      case 'gameroom':
        return (
          <GameRoomManager
            onStartGame={handleGameRoomStart}
            onBack={backToModeSelection}
            walletAddress={walletAddress}
            username={currentPlayer.username}
          />
        );

      case 'inventory':
        return (
          <PlayerInventory
            playerCards={allPlayerCards}
            onClose={closeInventory}
            onSelectCards={handleCardSelection}
            maxSelectable={3}
            selectionMode={opponentCards.length > 0} // Only enable selection mode if we came from difficulty selection
          />
        );

      case 'waiting':
        return (
          <UICard className="glassmorphism border-emerald-500/30 h-[600px] flex flex-col">
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="w-16 h-16 mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Ready to Battle on MONAD?</h2>
              <p className="text-gray-300 mb-8 text-center max-w-md">
                Challenge an opponent on the MONAD blockchain. All game moves are recorded as on-chain transactions, giving you true ownership of your battle history and rewards.
              </p>

              <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full max-w-md">
                <Button
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transform transition-all hover:scale-105"
                  onClick={startGame}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Start Battle
                </Button>
                <Button
                  className="w-full bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 transform transition-all hover:scale-105"
                  onClick={openInventory}
                >
                  <Package className="w-4 h-4 mr-2" />
                  View Inventory
                </Button>
              </div>

              <div className="mt-8 p-3 rounded-md bg-emerald-900/20 border border-emerald-500/30">
                <h3 className="text-sm font-semibold text-emerald-300 mb-2">Game Setup:</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-gray-300">Difficulty:</div>
                  <div className="text-emerald-400 font-semibold capitalize">{aiDifficulty}</div>
                  <div className="text-gray-300">Your Deck:</div>
                  <div className="text-emerald-400 font-semibold">{playerDeck.length} Cards Ready</div>
                  <div className="text-gray-300">Opponent:</div>
                  <div className="text-emerald-400 font-semibold">{opponentCards.length} Cards Ready</div>
                  <div className="text-gray-300">Shard Reward:</div>
                  <div className="text-emerald-400 font-semibold">{getShardReward()} Shards</div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <Button
                  variant="ghost"
                  className="text-xs text-gray-400 hover:text-white"
                  onClick={backToRoomSelection}
                >
                  Return to Room Selection
                </Button>
              </div>
            </div>
          </UICard>
        );

      case 'playing':
        return (
          <UICard className="glassmorphism border-emerald-500/30">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">MONAD Battle</h2>
                  <p className="text-gray-400 text-sm">
                    {gameMode === GameMode.PRACTICE ? (
                      <>
                        Difficulty: <span className="text-emerald-400 capitalize">{aiDifficulty}</span>
                        <span className="mx-2">•</span>
                        {renderManaExplanation()}
                      </>
                    ) : (
                      <>
                        Mode: <span className="text-blue-400">1v1 Game Room</span>
                        <span className="mx-2">•</span>
                        {renderManaExplanation()}
                        {currentRoom && (
                          <>
                            <span className="mx-2">•</span>
                            Room: <span className="text-blue-400 font-mono">{currentRoom.roomCode}</span>
                          </>
                        )}
                      </>
                    )}
                  </p>

                  {/* Game Sync Status - Only show for Game Room mode */}
                  {gameMode === GameMode.GAMEROOM && currentRoom && (
                    <div className="mt-2">
                      <GameSyncStatus roomCode={currentRoom.roomCode} />
                    </div>
                  )}
                </div>
                <ShardManager
                  player={playerData}
                  onRedeemShards={handleShardRedemption}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <UICard className="bg-black/30 border-emerald-500/20">
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <div className="text-emerald-400 text-sm mb-1 flex items-center">
                            <Shield className="w-4 h-4 mr-1" />
                            Your Health
                          </div>
                          <div className="h-4 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 ease-in-out"
                              style={{ width: `${(playerHealth / 20) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-xs text-white">{playerHealth}</span>
                            <span className="text-xs text-gray-500">20</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-red-400 text-sm mb-1 text-right flex items-center justify-end">
                            Opponent Health
                            <Shield className="w-4 h-4 ml-1" />
                          </div>
                          <div className="h-4 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-red-500 to-pink-500 rounded-full transition-all duration-500 ease-in-out"
                              style={{ width: `${(opponentHealth / 20) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-xs text-white">{opponentHealth}</span>
                            <span className="text-xs text-gray-500">20</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <div className="text-blue-400 text-sm mb-1 flex items-center">
                            <Zap className="w-4 h-4 mr-1" />
                            Your Mana
                          </div>
                          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500 ease-in-out"
                              style={{ width: `${(playerMana / 10) * 100}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-white mt-1">{playerMana}/10</div>
                        </div>
                        <div>
                          <div className="text-purple-400 text-sm mb-1 text-right flex items-center justify-end">
                            Opponent Mana
                            <Zap className="w-4 h-4 ml-1" />
                          </div>
                          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all duration-500 ease-in-out"
                              style={{ width: `${(opponentMana / 10) * 100}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-white mt-1 text-right">{opponentMana}/10</div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="text-white text-sm flex items-center">
                            Battle Log
                            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${currentTurn === 'player' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {currentTurn === 'player' ? 'Your Turn' : 'AI Turn'}
                            </span>
                          </h3>
                          {currentTurn === 'player' && gameMode === GameMode.GAMEROOM && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => endTurn('opponent')}
                              className="text-xs h-7 px-2 border-gray-700"
                            >
                              Skip Turn
                            </Button>
                          )}
                        </div>

                        {/* Turn Timer */}
                        {currentTurn === 'player' && gameMode === GameMode.GAMEROOM && (
                          <div className="mb-2">
                            <TurnTimer
                              isActive={currentTurn === 'player'}
                              duration={60} // 60 seconds per turn
                              onTimeExpired={handleTurnTimeExpired}
                            />
                          </div>
                        )}
                        <div className="bg-black/40 rounded-md p-2 h-40 overflow-y-auto border border-white/10">
                          {battleLog.map((log, index) => (
                            <p key={index} className={`text-xs mb-1 ${index === battleLog.length - 1 ? 'text-emerald-400' : 'text-gray-300'}`}>
                              {log}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-white text-sm mb-2 flex items-center">
                          <Sword className="w-4 h-4 mr-1" />
                          Your Cards
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {playerDeck.map(card => (
                            <div
                              key={card.id}
                              onClick={() => playCard(card)}
                              className={`cursor-pointer transform hover:-translate-y-1 transition-transform ${
                                currentTurn !== 'player' || playerMana < card.mana ? 'opacity-50' : 'hover:scale-105'
                              }`}
                            >
                              <GameCard card={card} showDetails={false} />
                            </div>
                          ))}
                          {playerDeck.length === 0 && (
                            <div className="col-span-3 text-center p-4 border border-dashed border-gray-700 rounded-md">
                              <p className="text-gray-400 text-sm">No cards in hand</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </UICard>
                </div>

                <div>
                  <MonadBoostMechanic
                    playerMonadBalance={playerMonadBalance}
                    onActivateBoost={handleBoostActivation}
                    boostActive={boostActive}
                    boostDetails={boostDetails}
                  />

                  <UICard className="bg-black/30 border-emerald-500/20 mt-4">
                    <div className="p-4">
                      <h3 className="text-white text-sm mb-2">Game Stats</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Turn:</span>
                          <span className={`text-xs ${currentTurn === 'player' ? 'text-emerald-400' : 'text-red-400'} capitalize`}>
                            {currentTurn}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Cards Left:</span>
                          <span className="text-xs text-white">You: {playerDeck.length} | Opponent: {opponentCards.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Fatigue:</span>
                          <span className="text-xs text-amber-400">{fatigueDamage} Damage</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">Shards:</span>
                          <span className="text-xs text-emerald-400">{playerData.shards}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">AI Difficulty:</span>
                          <span className="text-xs text-emerald-400 capitalize">{aiDifficulty}</span>
                        </div>
                      </div>
                    </div>
                  </UICard>

                  {aiDifficulty === AIDifficultyTier.LEGEND && (
                    <div className="mt-4 p-3 rounded-md bg-red-900/20 border border-red-500/30 animate-pulse">
                      <p className="text-xs text-red-400 font-semibold">
                        ⚠️ LEGEND MODE ACTIVE: AI has enhanced abilities and advanced strategy algorithms.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </UICard>
        );

      case 'end':
        return (
          <UICard className="glassmorphism border-emerald-500/30 h-[600px] flex flex-col">
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="w-16 h-16 mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Battle Complete</h2>
              <div className="bg-black/30 rounded-md p-4 mb-6 w-full max-w-md">
                <div className="text-center mb-4">
                  <div className="text-sm text-gray-400 mb-1">Final Result</div>
                  <div className={`text-lg font-bold ${playerHealth <= 0 ? 'text-red-400' : opponentHealth <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {playerHealth <= 0 ? 'Defeat' : opponentHealth <= 0 ? 'Victory!' : 'Draw'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1 flex items-center">
                      <Shield className="w-4 h-4 mr-1" />
                      Your Health
                    </div>
                    <div className="text-lg font-bold">{playerHealth}/20</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1 flex items-center justify-end">
                      Opponent Health
                      <Shield className="w-4 h-4 ml-1" />
                    </div>
                    <div className="text-lg font-bold text-right">{opponentHealth}/20</div>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-sm text-gray-400 mb-1">Total Shards</div>
                  <div className="text-3xl font-bold text-amber-400">{playerData.shards}</div>
                  <div className="text-xs text-gray-400 mt-1">Use these to redeem new cards!</div>
                </div>
                <div className="bg-black/30 rounded p-3">
                  <div className="text-sm text-gray-400 mb-1">Battle Log</div>                  <div className="max-h-32 overflow-y-auto text-xs text-gray-300">                    {battleLog.map((log, index) => (                      <p key={index} className="mb-1">{log}</p>                    ))}                  </div>                </div>              </div>              <div className="flex space-x-4 w-full max-w-md">                <Button onClick={backToRoomSelection} className="w-full bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 transform transition-all hover:scale-105">                  <Zap className="w-4 h-4 mr-2" />                  New Battle                </Button>                <Button onClick={openInventory} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transform transition-all hover:scale-105">                  <Package className="w-4 h-4 mr-2" />                  View Inventory                </Button>              </div>            </div>          </UICard>        );      default:        return null;    }  };  return (    <div>      {renderGameContent()}    </div>  );}
                  ;export default Game;