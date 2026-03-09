import { MongoClient, Db } from "mongodb";

const dbName = process.env.MONGODB_DB_NAME || "partyqueue";

type MongoGlobal = {
  clientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as typeof globalThis & MongoGlobal;

export async function getMongoClient() {
  if (!globalForMongo.clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    globalForMongo.clientPromise = new MongoClient(uri, {
      maxPoolSize: 10,
    }).connect();
  }

  return globalForMongo.clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
