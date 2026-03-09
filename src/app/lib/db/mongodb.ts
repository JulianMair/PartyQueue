import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "partyqueue";

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

type MongoGlobal = {
  clientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as typeof globalThis & MongoGlobal;

const clientPromise =
  globalForMongo.clientPromise ??
  new MongoClient(uri, {
    maxPoolSize: 10,
  }).connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo.clientPromise = clientPromise;
}

export async function getMongoClient() {
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
