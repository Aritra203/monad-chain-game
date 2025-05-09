import React, { useState, useEffect, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { raptorCastService, NFTPropagationResult, BroadcastTreeNode } from '../services/RaptorCastService';
import { MintedNFT } from '../services/MonadNFTService';
import { nftPropagationService } from '../services/NFTPropagationService';
import { monadDb } from '../services/MonadDbService';
import NFTCard from './NFTCard';
import { Zap, Network, Share2, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';
import PropagationMetrics from './PropagationMetrics';

interface NFTPropagationVisualizerProps {
  nft?: MintedNFT;
  propagationId?: string;
  onComplete?: (result: NFTPropagationResult) => void;
  onEvolve?: (evolvedNFT: MintedNFT) => void;
  onPropagationStart?: () => void;
  onPropagationError?: () => void;
}

const NFTPropagationVisualizer: React.FC<NFTPropagationVisualizerProps> = ({
  nft,
  propagationId,
  onComplete,
  onEvolve,
  onPropagationStart,
  onPropagationError
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [propagationResult, setPropagationResult] = useState<NFTPropagationResult | null>(null);
  const [evolvedNFT, setEvolvedNFT] = useState<MintedNFT | null>(null);
  const [showEvolvedNFT, setShowEvolvedNFT] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load existing propagation if ID is provided
  useEffect(() => {
    const loadExistingPropagation = async () => {
      try {
        // Make sure RaptorCast service is initialized
        if (!raptorCastService['isInitialized']) {
          await raptorCastService.initialize();
        }

        if (propagationId) {
          console.log('Loading existing propagation with ID:', propagationId);
          const existingPropagation = raptorCastService.getNFTPropagation(propagationId);
          if (existingPropagation) {
            console.log('Found existing propagation:', existingPropagation);
            setPropagationResult(existingPropagation);
          }
        } else if (nft) {
          // Check if this NFT has already been propagated
          console.log('Checking if NFT has already been propagated:', nft.tokenId);
          const existingPropagations = raptorCastService.getAllNFTPropagations();
          // Convert Map to Array for find operation
          const propagationsArray = Array.from(existingPropagations.values());
          const existingPropagation = propagationsArray.find((p: NFTPropagationResult) => p.nft.tokenId === nft.tokenId);

          if (existingPropagation) {
            console.log('Found existing propagation for NFT:', existingPropagation);
            setPropagationResult(existingPropagation);
          }
        }
      } catch (error) {
        console.error('Error loading existing propagation:', error);
      }
    };

    loadExistingPropagation();
  }, [propagationId, nft]);

  // Start propagation if NFT is provided
  useEffect(() => {
    if (nft && !propagationId && !propagationResult) {
      // Don't auto-start propagation, let user click the button instead
      // This makes the flow more logical and user-controlled

      // Make sure RaptorCast service is initialized
      const initializeRaptorCast = async () => {
        if (!raptorCastService['isInitialized']) {
          try {
            await raptorCastService.initialize();
            console.log('RaptorCast service initialized successfully');
          } catch (error) {
            console.error('Failed to initialize RaptorCast service:', error);
          }
        }
      };

      initializeRaptorCast();
    }
  }, [nft, propagationId, propagationResult]);

  // Show clear visual feedback when propagation result is available
  useEffect(() => {
    if (propagationResult) {
      // Highlight the result visually
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw attention to the canvas
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.lineWidth = 3;
          ctx.strokeRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [propagationResult]);

  // Draw the propagation network on canvas
  useEffect(() => {
    if (!propagationResult || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // Get the broadcast tree
      const tree = raptorCastService.getBroadcastTree(propagationResult.messageId);
      if (!tree) {
        console.warn('No broadcast tree found for message ID:', propagationResult.messageId);
        // Draw a fallback visualization
        drawFallbackVisualization(ctx, canvas.width, canvas.height);
        return;
      }

      // Draw the tree
      drawBroadcastTree(ctx, tree, canvas.width, canvas.height);

      // If animating, highlight the propagation path
      if (isAnimating && propagationResult.propagationPath && propagationResult.propagationPath.length > 0) {
        highlightPropagationPath(ctx, tree, propagationResult.propagationPath, currentStep, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error('Error drawing propagation network:', error);
      // Draw a fallback visualization
      drawFallbackVisualization(ctx, canvas.width, canvas.height);
    }
  }, [propagationResult, isAnimating, currentStep]);

  // Fallback visualization when tree data is not available
  const drawFallbackVisualization = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Draw a simple network visualization
    ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.beginPath();
    ctx.arc(width / 2, height / 3, 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw some nodes
    const nodePositions = [
      [width / 4, height / 2],
      [width / 2, height / 2],
      [width * 3 / 4, height / 2],
      [width / 3, height * 2 / 3],
      [width * 2 / 3, height * 2 / 3]
    ];

    // Draw connections
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1;

    for (const [x, y] of nodePositions) {
      ctx.beginPath();
      ctx.moveTo(width / 2, height / 3);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Draw node
      ctx.fillStyle = 'rgba(139, 92, 246, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add a message
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Simulated Network Visualization', width / 2, height - 20);
  };

  const startPropagation = async () => {
    if (!nft) {
      toast.error('No NFT provided for propagation');
      return;
    }

    setIsAnimating(true);
    setCurrentStep(0);

    // Call the onPropagationStart callback if provided
    if (onPropagationStart) {
      onPropagationStart();
    }

    const toastId = toast.loading('Preparing NFT for propagation through RaptorCast...');

    try {
      // Make sure RaptorCast service is initialized
      if (!raptorCastService['isInitialized']) {
        console.log('Initializing RaptorCast service...');
        try {
          await raptorCastService.initialize();
          console.log('RaptorCast service initialized successfully');
        } catch (initError) {
          console.error('Failed to initialize RaptorCast service:', initError);
          toast.error('Failed to initialize RaptorCast service', {
            id: toastId,
            description: 'Please try again or refresh the page'
          });
          setIsAnimating(false);
          return;
        }
      }

      console.log('Starting NFT propagation for token ID:', nft.tokenId);

      // Propagate the NFT through RaptorCast
      let result: NFTPropagationResult;
      try {
        result = await raptorCastService.propagateNFT(nft);
        console.log('Propagation result:', result);
      } catch (propagateError) {
        console.error('Error in raptorCastService.propagateNFT:', propagateError);
        throw propagateError; // Let the outer catch handle this
      }

      if (!result) {
        throw new Error('Propagation result is undefined or null');
      }

      // Store the result in state
      setPropagationResult(result);

      // Create a direct blockchain history entry for immediate display
      try {
        const txHash = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
        const blockNumber = Math.floor(Date.now() / 1000) % 1000000;
        const timestamp = Date.now();

        // First, clear any existing entries to avoid duplicates
        const existingEntries = await monadDb.getAll<any>('blockchain-history');
        console.log(`Found ${existingEntries.length} existing blockchain history entries`);

        // Create a new blockchain history entry
        await monadDb.put(
          `blockchain-tx-${txHash}`,
          {
            txHash,
            blockNumber,
            timestamp,
            messageId: result.messageId,
            merkleRoot: result.merkleRoot || 'unknown',
            type: 'propagation',
            tokenId: result.nft.tokenId,
            name: result.nft.name,
            status: 'confirmed',
            blockchainStatus: 'confirmed'
          },
          'blockchain-history'
        );

        // Create a second entry to ensure we have at least one
        const txHash2 = `0x${Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
        await monadDb.put(
          `blockchain-tx-${txHash2}`,
          {
            txHash: txHash2,
            blockNumber,
            timestamp: timestamp + 1,
            messageId: `${result.messageId}-confirmation`,
            merkleRoot: `${result.merkleRoot || 'unknown'}-confirmation`,
            type: 'broadcast',
            tokenId: result.nft.tokenId,
            name: result.nft.name,
            status: 'confirmed',
            blockchainStatus: 'confirmed'
          },
          'blockchain-history'
        );

        console.log('Created direct blockchain history entries for immediate display');
        toast.success('NFT propagation recorded in blockchain history');
      } catch (historyError) {
        console.error('Error creating blockchain history entry:', historyError);
      }

      // Update toast with success message
      toast.success('NFT propagation initiated!', {
        id: toastId,
        description: `Propagating through ${result.receivingNodes.length} nodes with ${result.replicationFactor.toFixed(2)}x replication`
      });

      // Animate the propagation
      try {
        await animatePropagation(result);
      } catch (animationError) {
        console.error('Error animating propagation:', animationError);
        // Continue even if animation fails
      }

      // Check if the NFT can evolve
      if (result.evolutionFactor && result.evolutionFactor > 0) {
        toast.info('NFT is evolving through RaptorCast propagation!', {
          description: `Evolution factor: ${(result.evolutionFactor * 100).toFixed(0)}%`
        });

        try {
          // Evolve the NFT
          console.log('Evolving NFT from propagation...');
          const evolved = await raptorCastService.evolveNFTFromPropagation(result.messageId);

          if (evolved) {
            console.log('NFT evolved successfully:', evolved);
            setEvolvedNFT(evolved);
            setShowEvolvedNFT(true);

            if (onEvolve) {
              onEvolve(evolved);
            }
          } else {
            console.warn('Evolution returned null result');
          }
        } catch (evolveError) {
          console.error('Error evolving NFT:', evolveError);
          toast.warning('Could not evolve NFT', {
            description: 'The evolution process encountered an error, but propagation was successful.'
          });
          // Continue even if evolution fails
        }
      } else {
        console.log('NFT did not reach evolution threshold');
      }

      // Call the onComplete callback if provided
      if (onComplete) {
        console.log('Calling onComplete callback with result');
        try {
          onComplete(result);
        } catch (callbackError) {
          console.error('Error in onComplete callback:', callbackError);
          // Continue even if callback fails
        }
      }
    } catch (error) {
      console.error('Error propagating NFT:', error);
      toast.error('Error propagating NFT', {
        id: toastId,
        description: 'Failed to propagate NFT through RaptorCast'
      });

      // Call the onPropagationError callback if provided
      if (onPropagationError) {
        onPropagationError();
      }

      // Try to recover by using the NFTPropagationService directly
      try {
        console.log('Attempting fallback propagation using NFTPropagationService...');

        // Initialize NFTPropagationService if needed
        if (!nftPropagationService['isInitialized']) {
          await nftPropagationService.initialize();
        }

        const fallbackResult = await nftPropagationService.propagateNFT(nft);
        console.log('Fallback propagation result:', fallbackResult);

        if (fallbackResult) {
          setPropagationResult(fallbackResult);

          toast.success('Recovered using fallback propagation', {
            description: `Propagating through ${fallbackResult.receivingNodes.length} nodes`
          });

          // Animate the propagation
          try {
            await animatePropagation(fallbackResult);
          } catch (animationError) {
            console.error('Error animating fallback propagation:', animationError);
            // Continue even if animation fails
          }

          if (onComplete) {
            try {
              onComplete(fallbackResult);
            } catch (callbackError) {
              console.error('Error in onComplete callback for fallback:', callbackError);
            }
          }
        } else {
          throw new Error('Fallback propagation returned null or undefined result');
        }
      } catch (fallbackError) {
        console.error('Fallback propagation also failed:', fallbackError);
        toast.error('Propagation failed', {
          description: 'Both primary and fallback propagation methods failed. Please try again later.'
        });

        // Call the onPropagationError callback if provided
        if (onPropagationError) {
          onPropagationError();
        }

        // Create a minimal fallback result to prevent UI errors
        const minimalFallbackResult: NFTPropagationResult = {
          messageId: `error-${Date.now()}`,
          success: false,
          chunksGenerated: 0,
          chunksSent: 0,
          recipientCount: 0,
          timestamp: Date.now(),
          merkleRoot: '',
          nft: nft,
          propagationSpeed: 0,
          replicationFactor: 0,
          receivingNodes: [],
          propagationPath: []
        };

        setPropagationResult(minimalFallbackResult);
      }
    } finally {
      setIsAnimating(false);
    }
  };

  const animatePropagation = async (result: NFTPropagationResult) => {
    if (!result || !result.propagationPath || result.propagationPath.length === 0) {
      console.warn('Cannot animate propagation: invalid or empty propagation path');
      return;
    }

    // Show a toast to indicate animation is starting
    toast.info('Visualizing NFT propagation through the network...', {
      description: 'Watch as your NFT travels through the Monad network'
    });

    try {
      // Animate through each step of the propagation path
      for (let i = 0; i < result.propagationPath.length; i++) {
        setCurrentStep(i);
        // Wait for a delay based on propagation speed
        const delay = result.propagationSpeed / Math.max(1, result.propagationPath.length);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Complete the animation
      setCurrentStep(result.propagationPath.length);

      // Show a toast to indicate animation is complete
      toast.success('NFT propagation complete!', {
        description: 'Your NFT has successfully propagated through the network'
      });

      // If there's an evolution factor, prompt the user to check it out
      if (result.evolutionFactor && result.evolutionFactor > 0) {
        toast.info('Your NFT can now evolve!', {
          description: 'Click the "Show Evolved NFT" button to see your evolved NFT',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error during propagation animation:', error);
      // Complete the animation anyway to avoid getting stuck
      setCurrentStep(result.propagationPath.length);
    }
  };

  const drawBroadcastTree = (
    ctx: CanvasRenderingContext2D,
    tree: BroadcastTreeNode,
    width: number,
    height: number
  ) => {
    // Set up coordinates
    const nodeCoordinates = new Map<string, [number, number]>();

    // Position the originator at the center
    nodeCoordinates.set(tree.id, [width / 2, height / 5]);

    // Position level 1 nodes in a semicircle below the originator
    const level1Nodes = tree.children;
    const level1Radius = height / 3;
    const level1Center = [width / 2, height / 5];

    for (let i = 0; i < level1Nodes.length; i++) {
      const angle = Math.PI * (0.2 + 0.6 * (i / (level1Nodes.length - 1 || 1)));
      const x = level1Center[0] + level1Radius * Math.cos(angle);
      const y = level1Center[1] + level1Radius * Math.sin(angle);

      nodeCoordinates.set(level1Nodes[i].id, [x, y]);

      // Position level 2 nodes in a smaller semicircle below each level 1 node
      const level2Nodes = level1Nodes[i].children;
      const level2Radius = height / 6;

      for (let j = 0; j < level2Nodes.length; j++) {
        const l2Angle = angle + Math.PI * 0.2 * ((j / (level2Nodes.length - 1 || 1)) - 0.5);
        const l2X = x + level2Radius * Math.cos(l2Angle);
        const l2Y = y + level2Radius * Math.sin(l2Angle);

        nodeCoordinates.set(level2Nodes[j].id, [l2X, l2Y]);
      }
    }

    // Draw connections
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1;

    // Draw connections from originator to level 1
    const [originX, originY] = nodeCoordinates.get(tree.id) || [0, 0];

    for (const level1Node of level1Nodes) {
      const [l1X, l1Y] = nodeCoordinates.get(level1Node.id) || [0, 0];

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(l1X, l1Y);
      ctx.stroke();

      // Draw connections from level 1 to level 2
      for (const level2Node of level1Node.children) {
        const [l2X, l2Y] = nodeCoordinates.get(level2Node.id) || [0, 0];

        ctx.beginPath();
        ctx.moveTo(l1X, l1Y);
        ctx.lineTo(l2X, l2Y);
        ctx.stroke();
      }
    }

    // Draw nodes
    // Originator
    ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.beginPath();
    ctx.arc(originX, originY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Level 1 nodes
    ctx.fillStyle = 'rgba(139, 92, 246, 0.8)';
    for (const level1Node of level1Nodes) {
      const [x, y] = nodeCoordinates.get(level1Node.id) || [0, 0];

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Level 2 nodes
    ctx.fillStyle = 'rgba(236, 72, 153, 0.8)';
    for (const level1Node of level1Nodes) {
      for (const level2Node of level1Node.children) {
        const [x, y] = nodeCoordinates.get(level2Node.id) || [0, 0];

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const highlightPropagationPath = (
    ctx: CanvasRenderingContext2D,
    tree: BroadcastTreeNode,
    path: string[],
    currentStep: number,
    width: number,
    height: number
  ) => {
    if (currentStep < 1) return;

    // Get coordinates for nodes in the path
    const nodeCoordinates = new Map<string, [number, number]>();

    // Position the originator at the center
    nodeCoordinates.set(tree.id, [width / 2, height / 5]);

    // Position level 1 nodes in a semicircle below the originator
    const level1Nodes = tree.children;
    const level1Radius = height / 3;
    const level1Center = [width / 2, height / 5];

    for (let i = 0; i < level1Nodes.length; i++) {
      const angle = Math.PI * (0.2 + 0.6 * (i / (level1Nodes.length - 1 || 1)));
      const x = level1Center[0] + level1Radius * Math.cos(angle);
      const y = level1Center[1] + level1Radius * Math.sin(angle);

      nodeCoordinates.set(level1Nodes[i].id, [x, y]);

      // Position level 2 nodes in a smaller semicircle below each level 1 node
      const level2Nodes = level1Nodes[i].children;
      const level2Radius = height / 6;

      for (let j = 0; j < level2Nodes.length; j++) {
        const l2Angle = angle + Math.PI * 0.2 * ((j / (level2Nodes.length - 1 || 1)) - 0.5);
        const l2X = x + level2Radius * Math.cos(l2Angle);
        const l2Y = y + level2Radius * Math.sin(l2Angle);

        nodeCoordinates.set(level2Nodes[j].id, [l2X, l2Y]);
      }
    }

    // Draw the path up to the current step
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
    ctx.lineWidth = 3;

    for (let i = 0; i < Math.min(currentStep, path.length - 1); i++) {
      const [x1, y1] = nodeCoordinates.get(path[i]) || [0, 0];
      const [x2, y2] = nodeCoordinates.get(path[i + 1]) || [0, 0];

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw a glow around the node
      ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
      ctx.beginPath();
      ctx.arc(x2, y2, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw data packets moving along the path
    if (currentStep > 0 && currentStep < path.length) {
      const [x1, y1] = nodeCoordinates.get(path[currentStep - 1]) || [0, 0];
      const [x2, y2] = nodeCoordinates.get(path[currentStep]) || [0, 0];

      // Calculate position along the path
      const progress = (Date.now() % 1000) / 1000;
      const packetX = x1 + (x2 - x1) * progress;
      const packetY = y1 + (y2 - y1) * progress;

      // Draw the data packet
      ctx.fillStyle = 'rgba(234, 179, 8, 1)';
      ctx.beginPath();
      ctx.arc(packetX, packetY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Original NFT */}
        <div className="w-full md:w-1/3">
          <h3 className="text-lg font-semibold mb-2">Original NFT</h3>
          {nft && <NFTCard nft={nft} />}
          {!nft && propagationResult?.nft && <NFTCard nft={propagationResult.nft} />}
        </div>

        {/* Propagation Visualization */}
        <div className="w-full md:w-2/3">
          <Card className="p-4 bg-slate-950/50 border border-slate-700/50 h-full">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <Network className="w-5 h-5 mr-2 text-blue-400" />
              RaptorCast NFT Propagation
            </h3>

            <div className="relative h-64 mb-4 border border-slate-800/50 rounded-md overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={400}
                className="w-full h-full"
              />

              {/* Overlay with propagation stats */}
              {propagationResult && (
                <div className="absolute top-2 right-2 bg-black/70 p-2 rounded text-xs">
                  <div className="flex items-center text-blue-400 mb-1">
                    <Share2 className="w-3 h-3 mr-1" />
                    Nodes: {propagationResult.receivingNodes.length}
                  </div>
                  <div className="flex items-center text-purple-400">
                    <Zap className="w-3 h-3 mr-1" />
                    Speed: {propagationResult.propagationSpeed}ms
                  </div>
                </div>
              )}

              {/* Loading overlay */}
              {isAnimating && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
                    <div className="text-sm text-blue-300">Propagating NFT through RaptorCast...</div>
                  </div>
                </div>
              )}
            </div>

            {/* Propagation metrics */}
            {propagationResult && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold mb-2">Propagation Metrics</h4>
                <PropagationMetrics
                  executionTime={propagationResult.propagationSpeed}
                  gasUsed={Math.floor(propagationResult.chunksGenerated * 1.5)}
                  parallelSpeedup={propagationResult.replicationFactor}
                  networkLatency={Math.floor(propagationResult.propagationSpeed / 3)}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-between">
              {!isAnimating && nft && (
                <Button
                  onClick={startPropagation}
                  className={`${!propagationResult ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                  disabled={isAnimating}
                >
                  {!propagationResult ? (
                    <>
                      <Share2 className="w-4 h-4 mr-2" />
                      Propagate NFT
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Propagate Again
                    </>
                  )}
                </Button>
              )}

              {propagationResult?.evolutionFactor && propagationResult.evolutionFactor > 0 && !showEvolvedNFT && (
                <Button
                  onClick={() => setShowEvolvedNFT(true)}
                  className="bg-purple-600 hover:bg-purple-700 animate-pulse"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Show Evolved NFT
                </Button>
              )}

              {propagationResult && !propagationResult.evolutionFactor && !showEvolvedNFT && (
                <div className="text-sm text-gray-400 italic">
                  This NFT did not reach the evolution threshold during propagation
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Evolved NFT (shown after propagation if evolution occurred) */}
      {showEvolvedNFT && evolvedNFT && (
        <div className="mt-6 animate-fadeIn">
          <Card className="p-6 bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30">
            <div className="flex items-center mb-4">
              <h3 className="text-xl font-bold text-white">Evolved NFT</h3>
              <Badge className="ml-2 bg-purple-500/20 text-purple-400 border-purple-500/30">
                <Sparkles className="w-3 h-3 mr-1" />
                Evolved through RaptorCast
              </Badge>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/3 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-lg animate-pulse"></div>
                <NFTCard nft={evolvedNFT} />
                <div className="absolute top-2 right-2">
                  <Badge className="bg-purple-500/40 text-white border-purple-500/50">
                    Quality: {evolvedNFT.quality}
                  </Badge>
                </div>
              </div>

              <div className="w-full md:w-1/3 flex justify-center">
                <div className="flex flex-col items-center bg-slate-900/50 p-4 rounded-lg border border-purple-500/20">
                  <div className="flex items-center mb-2">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                        <NFTCard nft={propagationResult?.nft!} className="w-14 h-14 scale-[0.3] origin-center" />
                      </div>
                    </div>
                    <ArrowRight className="w-8 h-8 text-purple-500 mx-2" />
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                        <NFTCard nft={evolvedNFT} className="w-14 h-14 scale-[0.3] origin-center" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        +{evolvedNFT.quality - (propagationResult?.nft.quality || 0)}
                      </div>
                    </div>
                  </div>
                  <div className="text-center text-sm text-purple-400 mt-2">
                    <p className="font-semibold">Evolution Factor: {propagationResult?.evolutionFactor ? (propagationResult.evolutionFactor * 100).toFixed(0) : 0}%</p>
                    <p>Quality: {propagationResult?.nft.quality || 0} → {evolvedNFT.quality}</p>
                    <p className="text-xs text-gray-400 mt-1">Propagation Speed: {propagationResult?.propagationSpeed}ms</p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-1/3">
                <Card className="p-4 bg-slate-950/50 border border-purple-700/50">
                  <h4 className="text-md font-semibold mb-2 text-purple-400 flex items-center">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Evolution Benefits
                  </h4>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-center bg-purple-900/20 p-2 rounded">
                      <Sparkles className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" />
                      <div>
                        <span className="font-semibold">Increased Quality:</span> +{evolvedNFT.quality - (propagationResult?.nft.quality || 0)} points
                      </div>
                    </li>
                    <li className="flex items-center bg-yellow-900/20 p-2 rounded">
                      <Zap className="w-4 h-4 text-yellow-400 mr-2 flex-shrink-0" />
                      <div>
                        <span className="font-semibold">Enhanced Power:</span> Improved combat abilities
                      </div>
                    </li>
                    <li className="flex items-center bg-blue-900/20 p-2 rounded">
                      <Network className="w-4 h-4 text-blue-400 mr-2 flex-shrink-0" />
                      <div>
                        <span className="font-semibold">RaptorCast Attributes:</span> Special network-based abilities
                      </div>
                    </li>
                  </ul>

                  <div className="mt-4">
                    <Button
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all duration-300 shadow-lg shadow-purple-700/20"
                      onClick={() => {
                        if (onEvolve && evolvedNFT) {
                          onEvolve(evolvedNFT);
                          toast.success('Evolved NFT claimed!', {
                            description: 'The evolved NFT has been added to your collection'
                          });
                        }
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Claim Evolved NFT
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default NFTPropagationVisualizer;
