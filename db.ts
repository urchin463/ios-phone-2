import * as FileSystem from 'expo-file-system';

export interface Receiver {
  id: number;
  name: string;
  number: string;
  lastUsed: number;
}

interface Database {
  receivers: Receiver[];
  lastId: number;
}

const DB_FILE = `${FileSystem.documentDirectory}momo.json`;

class DatabaseManager {
  private static instance: DatabaseManager;
  private database: Database = {
    receivers: [],
    lastId: 0
  };

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private async loadDatabase(): Promise<void> {
    try {
      const fileExists = await FileSystem.getInfoAsync(DB_FILE);
      if (!fileExists.exists) {
        await this.saveDatabase();
        return;
      }

      const content = await FileSystem.readAsStringAsync(DB_FILE);
      this.database = JSON.parse(content);
    } catch (error) {
      console.error('Failed to load database:', error);
      // If loading fails, initialize with empty database
      this.database = { receivers: [], lastId: 0 };
      await this.saveDatabase();
    }
  }

  private async saveDatabase(): Promise<void> {
    try {
      await FileSystem.writeAsStringAsync(
        DB_FILE,
        JSON.stringify(this.database, null, 2)
      );
    } catch (error) {
      console.error('Failed to save database:', error);
      throw error;
    }
  }

  async init(): Promise<boolean> {
    try {
      await this.loadDatabase();
      return true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async saveReceiver(receiver: Omit<Receiver, 'id' | 'lastUsed'>): Promise<void> {
    try {
      await this.loadDatabase();

      // Check if receiver already exists
      const existingIndex = this.database.receivers.findIndex(
        r => r.number === receiver.number && r.name === receiver.name
      );

      if (existingIndex >= 0) {
        // Update existing receiver
        this.database.receivers[existingIndex].lastUsed = Date.now();
      } else {
        // Add new receiver
        this.database.receivers.push({
          id: ++this.database.lastId,
          name: receiver.name,
          number: receiver.number,
          lastUsed: Date.now()
        });
      }

      await this.saveDatabase();
    } catch (error) {
      console.error('Failed to save receiver:', error);
      throw error;
    }
  }

  async searchReceivers(query: string): Promise<Receiver[]> {
    try {
      await this.loadDatabase();
      const lowerQuery = query.toLowerCase();
      
      return this.database.receivers
        .filter(receiver => 
          receiver.name.toLowerCase().includes(lowerQuery) ||
          receiver.number.includes(query)
        )
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, 5);
    } catch (error) {
      console.error('Failed to search receivers:', error);
      throw error;
    }
  }

  async getRecentReceivers(): Promise<Receiver[]> {
    try {
      await this.loadDatabase();
      
      return [...this.database.receivers]
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, 5);
    } catch (error) {
      console.error('Failed to get recent receivers:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const dbManager = DatabaseManager.getInstance();

// Export the instance methods
export const initDatabase = () => dbManager.init();
export const saveReceiver = (receiver: Omit<Receiver, 'id' | 'lastUsed'>) => dbManager.saveReceiver(receiver);
export const searchReceivers = (query: string) => dbManager.searchReceivers(query);
export const getRecentReceivers = () => dbManager.getRecentReceivers();

export default DatabaseManager; 