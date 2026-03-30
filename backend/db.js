import { Connection, Workspace, AgentContext } from './broccolidb/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

let agentContext;
let workspace;

// Advanced Cognitive Services
export const Message = {
  findAll: async () => {
    if (!agentContext) return [];
    const results = await agentContext.graphService.traverseGraph("HEAD", 100, {
      direction: "both",
      minWeight: 0
    });
    
    return results
      .filter(node => node.type === 'fact' && node.tags?.includes('chat-message'))
      .map(node => ({
        id: node.itemId,
        user: node.metadata?.user || 'Unknown',
        message: node.content,
        type: node.metadata?.type || 'bot',
        images: node.metadata?.images || [],
        soundness: node.metadata?.soundness || 1.0,
        timestamp: node.metadata?.timestamp || Date.now()
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  create: async (data) => {
    if (!agentContext) throw new Error("Cognitive Substrate not initialized");
    
    const kbId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Perform Epistemic Audit for bot messages
    let soundness = 1.0;
    if (data.type === 'bot') {
      const audit = await agentContext.reasoningService.getLogicalSoundness([kbId]);
      soundness = audit.compositeScore || 1.0;
    }

    await agentContext.addKnowledge(kbId, "fact", data.message || "", {
      tags: ["chat-message"],
      metadata: {
        user: data.user,
        type: data.type,
        images: data.images || [],
        soundness: soundness,
        timestamp: Date.now()
      }
    });

    return { id: kbId, soundness, ...data };
  },

  destroy: async () => {
    await workspace.deleteRepo('chat-history');
    await workspace.createRepo('chat-history');
  }
};

// Structural Awareness (Spider)
export async function getSystemHealth() {
  if (!agentContext) return { entropy: 0, health: 'Unknown', violations: 0, nodeCount: 0 };
  const audit = await agentContext.spiderService.auditStructure();
  
  const nodes = await workspace.getDb().selectWhere('knowledge', [{ column: 'userId', value: agentContext.userId }]);
  
  return {
    entropy: audit.entropy,
    health: audit.entropy < 0.3 ? 'Sovereign' : 'High Entropy',
    violations: audit.violations.length,
    nodeCount: nodes.length
  };
}

// Proactive Cognition: Suggestions
export async function getCognitiveSuggestions(messageId) {
  if (!agentContext) return [];
  // Generate suggestions based on the newly indexed knowledge/message node
  const suggestions = await agentContext.suggestionService.getSuggestions(messageId, {
    maxSuggestions: 3,
    minConfidence: 0.6
  });
  
  return suggestions.map(s => ({
    id: s.id,
    label: s.label,
    reasoning: s.reasoning,
    action: s.suggestedAction
  }));
}

// Cognitive Grounding (RAG)
export async function searchSubstrate(query) {
  if (!agentContext) return "";
  const results = await agentContext.searchKnowledge(query, ["grounding"], 5);
  return results.map(r => `[GROUNDING: ${r.itemId}] ${r.content}`).join('\n\n');
}

// Knowledge Ingestion (Seeding the Substrate)
async function ingestProjectKnowledge() {
  try {
    const nanoMdPath = path.join(PROJECT_ROOT, 'nano.md');
    const nanoMd = fs.readFileSync(nanoMdPath, 'utf8');

    await agentContext.addKnowledge('nano-spec-1', 'fact', nanoMd, {
      tags: ['grounding', 'spec', 'technical'],
      metadata: { source: 'nano.md', version: '2.0.0' },
      confidence: 1.0
    });

    const serverJsPath = path.join(__dirname, 'server.js');
    if (fs.existsSync(serverJsPath)) {
        const serverJs = fs.readFileSync(serverJsPath, 'utf8');
        await agentContext.addKnowledge('nano-arch-server', 'fact', serverJs, {
          tags: ['grounding', 'arch', 'code'],
          metadata: { source: 'server.js' },
          confidence: 0.9
        });
    }
  } catch (error) {
    console.error('Failed project knowledge ingestion:', error);
  }
}

export async function initDB() {
  try {
    const conn = new Connection({ dbPath: path.join(__dirname, 'nano_memory.db') });
    workspace = new Workspace(conn, 'nano-user', 'nano-workspace');
    await workspace.init();

    let repo;
    try {
      repo = await workspace.getRepo('chat-history');
    } catch (e) {
      repo = await workspace.createRepo('chat-history');
    }

    agentContext = new AgentContext(workspace);
    
    // Services are automatically initialized within AgentContext, but we can configure them if needed.
    
    // 1. Register the Nano Banana 2 Agent
    await agentContext.registerAgent('nano-bot-1', 'Nano Banana 2', 'Epistemic Lead', ['reason', 'audit', 'spider', 'suggest']);

    // 2. Bootstrap Structural Awareness (Indexing the project)
    console.log('--- 🕷️ Initializing Structural Discovery Service ---');
    await agentContext.spiderService.bootstrapGraph();
    
    // 3. Cognitive Knowledge Ingestion
    await ingestProjectKnowledge();

    console.log('--- 🥦 BroccoliDB FULL Substrate Initialized ---');
  } catch (error) {
    console.error('Failed to initialize BroccoliDB Substrate:', error);
    throw error;
  }
}
