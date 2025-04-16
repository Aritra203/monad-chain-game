import React, { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import { Card as UICard } from "@/components/ui/card";
import GameCard from '@/components/GameCard';
import MonadStatus from '@/components/MonadStatus';
import ShardManager from '@/components/ShardManager';
import MonadBoostMechanic from '@/components/MonadBoostMechanic';
import GameRoomSelector from '@/components/GameRoomSelector';
import PlayerInventory from '@/components/PlayerInventory';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toast } from "sonner";
import { cards, currentPlayer, monadGameState } from '@/data/gameData';
import { Card as GameCardType, MonadGameMove, CardType, AIDifficultyTier, TierRequirement, Player as PlayerType } from '@/types/game';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Shield, Sword, Zap } from 'lucide-react';
import { aiStrategies, selectCardNovice, selectCardVeteran, selectCardLegend, getAIThinkingMessage, enhanceAICards } from '@/data/aiStrategies';
import { monadGameService } from '@/services/MonadGameService';

const STORAGE_KEY_SHARDS = "monad_game_shards";
const STORAGE_KEY_LAST_REDEMPTION = "monad_game_last_redemption";
const STORAGE_KEY_DAILY_TRIALS = "monad_game_daily_trials";
const STORAGE_KEY_PLAYER_CARDS = "monad_game_player_cards";

const Game = () => {
  const { toast: uiToast } = useToast();
  const [playerDeck, setPlayerDeck] = useState<GameCardType[]>(currentPlayer.cards);
  const [opponentCards, setOpponentCards] = useState<GameCardType[]>([]);
  const [selectedCard, setSelectedCard] = useState<GameCardType | null>(null);
  const [gameStatus, setGameStatus] = useState<'room_select' | 'inventory' | 'waiting' | 'playing' | 'end'>('room_select');
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
  const [boostDetails, setBoostDetails] = useState<{effect: number, remainingTurns: number} | null>(null);
  const [allPlayerCards, setAllPlayerCards] = useState<GameCardType[]>(currentPlayer.cards);
  const [isOpponentStunned, setIsOpponentStunned] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [playerLastCards, setPlayerLastCards] = useState<GameCardType[]>([]);
  const [consecutiveDefenseCount, setConsecutiveDefenseCount] = useState(0);
  const [aiComboCounter, setAiComboCounter] = useState(0);
  const [isPlayerStunned, setPlayerStunned] = useState(false);

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
            const address = await monadGameService.connectWallet();
            setWalletAddress(address);
            setWalletConnected(true);

            const playerData = await monadGameService.getPlayerData(address);
            setIsRegistered(!!playerData);
        } catch (error) {
            console.error("Blockchain initialization error:", error);
            toast.error("Failed to connect to blockchain");
        }
    };

    initializeBlockchain();
  }, []);

  const getPlayableCards = useCallback((cards: GameCardType[], mana: number) => {
    return cards.filter(card => card.mana <= mana);
  }, []);

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

    switch (difficulty) {
      case AIDifficultyTier.NOVICE:
        opponentCardPool = cards.filter(card => card.rarity !== 'epic' && card.rarity !== 'legendary');
        break;

      case AIDifficultyTier.VETERAN:
        opponentCardPool = cards.filter(card => card.rarity !== 'legendary');
        break;

      case AIDifficultyTier.LEGEND:
        opponentCardPool = [...cards];
        break;

      default:
        opponentCardPool = [...cards];
    }

    opponentCardPool = enhanceAICards(opponentCardPool, difficulty);

    const randomCards: GameCardType[] = [];
    while (randomCards.length < 3 && opponentCardPool.length > 0) {
      const randomIndex = Math.floor(Math.random() * opponentCardPool.length);
      randomCards.push(opponentCardPool[randomIndex]);
      opponentCardPool.splice(randomIndex, 1);
    }

    setOpponentCards(randomCards);

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
    if (opponentCards.length === 0) {
      setGameStatus('room_select');
    } else {
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

    uiToast({
      title: "Game Started",
      description: "The battle has begun! Play your first card.",
    });

    toast.success("Connected to MONAD blockchain", {
      description: `Current block: ${monadGameState.currentBlockHeight}`,
      duration: 3000,
    });
  };

  const handleBoostActivation = (amount: number, boostEffect: number, duration: number) => {
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
    setBoostDetails({ effect: boostEffect, remainingTurns: duration });
    setPlayerMonadBalance(prev => prev - amount);

    setBattleLog(prev => [...prev, `MONAD Boost activated! +${boostEffect}% power for ${duration} turns`]);

    toast.success("Card Boost Activated!", {
      description: `All cards powered up by ${boostEffect}% for ${duration} turns`,
    });
  };

  function handleOpponentTurn() {
    if (gameStatus !== 'playing') return;

    if (isOpponentStunned) {
      setBattleLog(prev => [...prev, "Opponent is stunned and skips their turn!"]);
      setIsOpponentStunned(false);
      endTurn('player');
      return;
    }

    const playableCards = opponentCards.filter(card => card.mana <= opponentMana);

    if (playableCards.length > 0) {
      let cardToPlay: GameCardType;
      let aiThinkingDelay = aiStrategies[aiDifficulty].thinkingTime;

      const thinkingMessage = getAIThinkingMessage(aiDifficulty);
      setBattleLog(prev => [...prev, thinkingMessage]);

      switch (aiDifficulty) {
        case AIDifficultyTier.NOVICE:
          cardToPlay = selectCardNovice(playableCards, playerHealth, opponentHealth);
          break;

        case AIDifficultyTier.VETERAN:
          cardToPlay = selectCardVeteran(
            playableCards,
            playerHealth,
            opponentHealth,
            opponentMana,
            playerLastCards
          );
          break;

        case AIDifficultyTier.LEGEND:
          cardToPlay = selectCardLegend(
            playableCards,
            playerHealth,
            opponentHealth,
            opponentMana,
            playerDeck,
            playerLastCards[0]
          );
          break;

        default:
          cardToPlay = playableCards[0];
      }

      setTimeout(() => {
        setOpponentMana(prev => prev - cardToPlay.mana);
        setOpponentCards(prev => prev.filter(c => c.id !== cardToPlay.id));

        let newPlayerHealth = playerHealth;
        let newOpponentHealth = opponentHealth;
        let logEntry = `Opponent played ${cardToPlay.name}.`;

        if (cardToPlay.attack) {
          let attackBonus = 0;
          if (aiDifficulty !== AIDifficultyTier.NOVICE && aiComboCounter > 0) {
            attackBonus = Math.floor(cardToPlay.attack * (aiComboCounter * 0.1));
            logEntry += ` Combo bonus: +${attackBonus} damage!`;
          }

          const totalDamage = cardToPlay.attack + attackBonus;
          newPlayerHealth = Math.max(0, playerHealth - totalDamage);
          logEntry += ` Dealt ${totalDamage} damage.`;

          setAiComboCounter(prev => (cardToPlay.type === 'attack' ? prev + 1 : 0));
        } else {
          setAiComboCounter(0);
        }

        if (cardToPlay.defense) {
          const defenseBonus = consecutiveDefenseCount * (aiDifficulty === AIDifficultyTier.LEGEND ? 0.2 : 0.1);
          const totalHealing = Math.floor(cardToPlay.defense * (1 + defenseBonus));
          newOpponentHealth = Math.min(20, opponentHealth + totalHealing);
          logEntry += ` Gained ${totalHealing} health.`;
          setConsecutiveDefenseCount(prev => prev + 1);
        } else {
          setConsecutiveDefenseCount(0);
        }

        if (cardToPlay.specialEffect) {
          logEntry += ` ${cardToPlay.specialEffect.description}`;

          switch (cardToPlay.specialEffect.type) {
            case 'stun':
              if (Math.random() < (aiDifficulty === AIDifficultyTier.LEGEND ? 0.4 : 0.3)) {
                setPlayerStunned(true);
                logEntry += " (Player stunned!)";
              }
              break;

            case 'leech':
              if (cardToPlay.attack && cardToPlay.specialEffect.value) {
                const leechAmount = Math.floor(cardToPlay.attack * (cardToPlay.specialEffect.value / 100));
                newOpponentHealth = Math.min(20, newOpponentHealth + leechAmount);
                logEntry += ` (Leeched ${leechAmount} health)`;
              }
              break;

            case 'mana':
              const manaGain = cardToPlay.specialEffect.value || 1;
              setOpponentMana(prev => Math.min(10, prev + manaGain));
              logEntry += ` (Gained ${manaGain} mana)`;
              break;
          }
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
      setTimeout(handleOpponentTurn, 1000);
    }
  }, [boostActive, boostDetails]);

  useEffect(() => {
    if (gameStatus === 'playing' && currentTurn === 'opponent') {
      handleOpponentTurn();
    }
  }, [currentTurn, gameStatus]);

  const handleNoPlayableCards = (player: 'player' | 'opponent', message: string) => {
    const newLogs = [...battleLog, message];
    setBattleLog(newLogs);

    if (player === 'player') {
      endTurn('opponent');
    } else {
      endTurn('player');
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

    if (consecutiveSkips >= 2) {
        endGame(null);
        return;
    }

    endTurn(target === 'player' ? 'opponent' : 'player');
  };

  const playCard = async (card: GameCardType) => {
    if (currentTurn !== 'player' || gameStatus !== 'playing') {
      return;
    }

    if (playerMana < card.mana) {
      toast.warning(`Not enough mana (Need ${card.mana}, have ${playerMana})`);
      return;
    }

    try {
      const newMove: MonadGameMove = {
          gameId: Date.now(),
          moveId: `move-${Date.now()}`,
          playerAddress: walletAddress,
          cardId: card.id,
          moveType: card.type.toLowerCase() as 'attack' | 'defend' | 'special',
          timestamp: Date.now(),
          verified: false
      };

      await monadGameService.executeParallelMoves([newMove]);

      setPlayerMana(prev => prev - card.mana);
      setPlayerDeck(prev => prev.filter(c => c.id !== card.id));
      setSelectedCard(card);
      
      setPlayerLastCards(prev => [card, ...prev].slice(0, 3));

      let logEntry = `You played ${card.name}.`;
      let opponentNewHealth = opponentHealth;
      let playerNewHealth = playerHealth;
      let extraMana = 0;
      let applyStun = false;

      if (card.attack) {
        let damageBonus = 0;
        const lastCard = playerLastCards[0];
        if (lastCard?.type === 'attack') {
          damageBonus = Math.floor(card.attack * 0.2);
          logEntry += ` Combo bonus: +${damageBonus} damage!`;
        }

        const totalDamage = card.attack + damageBonus;
        opponentNewHealth = Math.max(0, opponentHealth - totalDamage);
        logEntry += ` Dealt ${totalDamage} damage.`;
      }

      if (card.defense) {
        let healingBonus = 0;
        if (playerLastCards[0]?.type === 'defense') {
          healingBonus = Math.floor(card.defense * 0.15);
          logEntry += ` Enhanced healing: +${healingBonus}!`;
        }

        const totalHealing = card.defense + healingBonus;
        playerNewHealth = Math.min(20, playerHealth + totalHealing);
        logEntry += ` Gained ${totalHealing} health.`;
      }

      if (card.specialEffect) {
        logEntry += ` ${card.specialEffect.description}`;

        switch (card.specialEffect.type) {
          case 'damage':
            if (card.specialEffect.value) {
              opponentNewHealth = Math.max(0, opponentNewHealth - card.specialEffect.value);
              logEntry += ` (${card.specialEffect.value} extra damage)`;
            }
            break;

          case 'heal':
            if (card.specialEffect.value) {
              playerNewHealth = Math.min(30, playerNewHealth + card.specialEffect.value);
              logEntry += ` (${card.specialEffect.value} extra healing)`;
            }
            break;

          case 'mana':
            if (card.specialEffect.value) {
              extraMana = card.specialEffect.value;
              logEntry += ` (Gained ${extraMana} extra mana)`;
            }
            break;

          case 'stun':
            applyStun = true;
            logEntry += ` (Opponent stunned for 1 turn)`;
            break;

          case 'leech':
            if (card.specialEffect.value && card.attack) {
              const leechAmount = Math.floor(card.attack * (card.specialEffect.value / 100));
              playerNewHealth = Math.min(30, playerNewHealth + leechAmount);
              logEntry += ` (Leeched ${leechAmount} health)`;
            }
            break;
        }
      }

      setOpponentHealth(opponentNewHealth);
      setPlayerHealth(playerNewHealth);
      setBattleLog(prev => [...prev, logEntry]);
      setPendingMoves(prev => [...prev, newMove]);

      if (opponentNewHealth <= 0) {
        endGame(true);
        return;
      }

      if (applyStun) {
        setIsOpponentStunned(true);
      }

      endTurn('opponent');

    } catch (error) {
      console.error("Error playing card:", error);
      toast.error("Failed to play card");
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
    } catch (error) {
        console.error("NFT redemption failed:", error);
        toast.error("Failed to redeem NFT");
    }
  };

  const endGame = async (playerWon: boolean | null) => {
    try {
        const gameData = {
            winner: playerWon ? walletAddress : null,
            playerHealth: playerHealth,
            opponentHealth: opponentHealth,
            difficulty: aiDifficulty,
            moves: pendingMoves
        };

        const movesBatch = {
            gameId: Date.now(),
            batchId: Date.now().toString(),
            moves: pendingMoves,
            stateRoot: "0x" + Math.random().toString(16).slice(2),
            zkProof: "0x" + Math.random().toString(16).slice(2),
            verificationTime: Date.now(),
            submittedInBlock: monadGameState.currentBlockHeight || 0
        };

        await monadGameService.submitMovesBatch(movesBatch);

        if (playerWon) {
            const reward = getShardReward();
            await monadGameService.claimShards(movesBatch.batchId);
        }

    } catch (error) {
        console.error("Failed to record game result:", error);
        toast.error("Failed to record game result on blockchain");
    }

    setGameStatus('end');
  };

  const resetGame = () => {
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
    setGameStatus('room_select');
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
                        try {
                            toast.loading("Registering player on Monad blockchain...");
                            await monadGameService.registerPlayer();
                            setIsRegistered(true);
                            toast.success("Successfully registered! Welcome to Monad Chain Game");
                        } catch (error: any) {
                            console.error("Registration failed:", error);
                            const errorMessage = error.message || "Failed to register. Please try again.";
                            toast.error("Registration failed", {
                                description: errorMessage
                            });
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
      case 'room_select':
        return <GameRoomSelector onSelectDifficulty={handleSelectDifficulty} />;

      case 'inventory':
        return (
          <PlayerInventory
            playerCards={allPlayerCards}
            onClose={closeInventory}
            onSelectCards={handleCardSelection}
            maxSelectable={3}
            selectionMode={opponentCards.length > 0}
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
                    Difficulty: <span className="text-emerald-400 capitalize">{aiDifficulty}</span>
                    <span className="mx-2">•</span>
                    {renderManaExplanation()}
                  </p>
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
                        <h3 className="text-white text-sm flex items-center mb-2">
                          Battle Log
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${currentTurn === 'player' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {currentTurn === 'player' ? 'Your Turn' : 'AI Turn'}
                          </span>
                        </h3>
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
                  <div className="text-sm text-gray-400 mb-1">Battle Log</div>                  <div className="max-h-32 overflow-y-auto text-xs text-gray-300">                    {battleLog.map((log, index) => (                      <p key={index} className="mb-1">{log}</p>                    ))}                  </div>                </div>              </div>              <div className="flex space-x-4 w-full max-w-md">                <Button onClick={backToRoomSelection} className="w-full bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 transform transition-all hover:scale-105">                  <Zap className="w-4 h-4 mr-2" />                  New Battle                </Button>                <Button onClick={openInventory} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transform transition-all hover:scale-105">                  <Package className="w-4 h-4 mr-2" />                  View Inventory                </Button>              </div>            </div>          </UICard>        );      default:        return null;    }  };  return (    <div className="min-h-screen bg-background">      <Navigation />      <div className="container mx-auto pt-24 px-4 pb-16">        {renderGameContent()}      </div>    </div>  );};
                  export default Game;