import { Router, type Request, type Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Provider, encryptApiKey, decryptApiKey, maskApiKey, type ProviderType } from '../models/Provider.js';

const router = Router();

// Get all providers (with masked API keys)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const providers = await Provider.findAll({
      order: [['createdAt', 'DESC']],
    });

    const providersWithMaskedKeys = providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      apiKey: maskApiKey(decryptApiKey(provider.apiKey)),
      isActive: provider.isActive,
      isValid: provider.isValid,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    }));

    res.json(providersWithMaskedKeys);
  } catch (error) {
    console.error('Failed to fetch providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Create a new provider
router.post('/', async (req: Request, res: Response) => {
  const { name, type, apiKey } = req.body;

  if (!name || !type || !apiKey) {
    return res.status(400).json({ error: 'Name, type, and API key are required' });
  }

  const validTypes: ProviderType[] = ['gemini', 'openai', 'anthropic'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Invalid provider type' });
  }

  try {
    const encryptedKey = encryptApiKey(apiKey);
    
    const provider = await Provider.create({
      name,
      type,
      apiKey: encryptedKey,
      isActive: true,
      isValid: null,
    });

    res.status(201).json({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      apiKey: maskApiKey(apiKey),
      isActive: provider.isActive,
      isValid: provider.isValid,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    });
  } catch (error) {
    console.error('Failed to create provider:', error);
    res.status(500).json({ error: 'Failed to create provider' });
  }
});

// Update a provider
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, apiKey, isActive } = req.body;

  try {
    const provider = await Provider.findByPk(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (name) provider.name = name;
    if (apiKey) provider.apiKey = encryptApiKey(apiKey);
    if (typeof isActive === 'boolean') provider.isActive = isActive;
    
    // Reset validation status when key changes
    if (apiKey) provider.isValid = null;

    await provider.save();

    res.json({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      apiKey: maskApiKey(decryptApiKey(provider.apiKey)),
      isActive: provider.isActive,
      isValid: provider.isValid,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    });
  } catch (error) {
    console.error('Failed to update provider:', error);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// Delete a provider
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const provider = await Provider.findByPk(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    await provider.destroy();
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Failed to delete provider:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

// Validate a provider's API key
router.post('/:id/validate', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const provider = await Provider.findByPk(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const apiKey = decryptApiKey(provider.apiKey);
    let isValid = false;

    try {
      switch (provider.type) {
        case 'gemini': {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          // Simple validation - try to generate content
          await model.generateContent('Hi');
          isValid = true;
          break;
        }
        case 'openai': {
          // OpenAI validation would go here
          // For now, we'll just check if the key format looks valid
          isValid = apiKey.startsWith('sk-') && apiKey.length > 20;
          break;
        }
        case 'anthropic': {
          // Anthropic validation would go here
          isValid = apiKey.startsWith('sk-ant-') && apiKey.length > 20;
          break;
        }
        default:
          isValid = false;
      }
    } catch (validationError) {
      console.error(`Validation failed for provider ${id}:`, validationError);
      isValid = false;
    }

    provider.isValid = isValid;
    await provider.save();

    res.json({
      id: provider.id,
      isValid,
      message: isValid ? 'API key is valid' : 'API key validation failed',
    });
  } catch (error) {
    console.error('Failed to validate provider:', error);
    res.status(500).json({ error: 'Failed to validate provider' });
  }
});

// Get active provider API key (for internal use by chat endpoint)
export async function getActiveProviderKey(type: ProviderType): Promise<string | null> {
  const provider = await Provider.findOne({
    where: {
      type,
      isActive: true,
    },
    order: [['createdAt', 'DESC']],
  });

  if (!provider) return null;
  return decryptApiKey(provider.apiKey);
}

export default router;