import { DataTypes, Model, type Optional, Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './nano_banana.db',
  logging: false,
});

interface MessageAttributes {
  id: string;
  user: string;
  message: string;
  type: string;
  timestamp: string;
  images: string[];
  soundness?: number;
}

interface MessageCreationAttributes
  extends Optional<MessageAttributes, 'id' | 'timestamp' | 'soundness'> {}

class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  public id!: string;
  public user!: string;
  public message!: string;
  public type!: string;
  public timestamp!: string;
  public images!: string[];
  public soundness?: number;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('user', 'bot'),
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    images: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    soundness: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0,
    },
  },
  {
    sequelize,
    modelName: 'Message',
  },
);

const initDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log('--- 🥦 BroccoliDB Cognitive Substrate Online ---');
  } catch (error) {
    console.error('Substrate initialization failed:', error);
  }
};

export { initDB, Message, sequelize };
