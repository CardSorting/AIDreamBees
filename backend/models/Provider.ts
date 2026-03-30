import { DataTypes, Model, type Optional, Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './nano_banana.db',
  logging: false,
});

export type ProviderType = 'gemini' | 'openai' | 'anthropic';

export interface ProviderAttributes {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  isActive: boolean;
  isValid: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCreationAttributes
  extends Optional<ProviderAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'isValid'> {}

export class Provider
  extends Model<ProviderAttributes, ProviderCreationAttributes>
  implements ProviderAttributes
{
  public id!: string;
  public name!: string;
  public type!: ProviderType;
  public apiKey!: string;
  public isActive!: boolean;
  public isValid!: boolean | null;
  public createdAt!: string;
  public updatedAt!: string;
}

Provider.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('gemini', 'openai', 'anthropic'),
      allowNull: false,
    },
    apiKey: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isValid: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Provider',
    tableName: 'providers',
    timestamps: true,
  },
);

// Simple XOR encryption for API keys (not production-grade, but better than plaintext)
// In production, use environment-based keys or KMS
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-key-32-chars-long!!!';

export function encryptApiKey(apiKey: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '!').slice(0, 32));
  let encrypted = '';
  for (let i = 0; i < apiKey.length; i++) {
    encrypted += String.fromCharCode(apiKey.charCodeAt(i) ^ key[i % key.length]!);
  }
  return Buffer.from(encrypted).toString('base64');
}

export function decryptApiKey(encryptedKey: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '!').slice(0, 32));
  const encrypted = Buffer.from(encryptedKey, 'base64').toString();
  let decrypted = '';
  for (let i = 0; i < encrypted.length; i++) {
    decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ key[i % key.length]!);
  }
  return decrypted;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
}

export { sequelize };
