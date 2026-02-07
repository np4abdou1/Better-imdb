import { MongoClient, ServerApiVersion, Db, Collection, WithId, Document, UpdateResult, InsertOneResult } from 'mongodb';

// Define interfaces for tables (adapted for MongoDB)
export interface User {
  id: string; // We keep the string ID for auth compatibility
  name: string | null;
  email: string | null;
  image: string | null;
  copilot_token: string | null;
  created_at: Date; // Changed to Date object for Mongo
}

export interface List {
  id?: string; // Optional because Mongo generates _id, but we might want to keep numeric id or simple string id
  _id?: any;
  user_id: string | null;
  name: string;
  created_at: Date;
}

export interface Rating {
  user_id: string;
  title_id: string;
  score: number | null;
  review: string | null;
  rated_at: Date;
}

export interface ListItem {
  id?: string;
  _id?: any;
  list_id: string; // Changed to string to match Mongo ID if we use _id, or keep number if we migrate IDs
  title_id: string;
  added_at: Date;
}

export interface AIChat {
  id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AIMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: Date;
}

export interface StreamMapping {
  imdb_id: string;
  provider_id: string | null;
  type: string | null;
  cached_stream_url: string | null;
  expires_at: number | null;
  metadata: any | null; // Changed to any for JSON
  created_at: Date;
}

// Connection Setup
const uri = process.env.MONGODB_URI || "mongodb+srv://np4abdou:<db_password>@cluster0.3eqfqyt.mongodb.net/?appName=Cluster0";
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!process.env.MONGODB_URI) {
  // Warn if no URI (but we use the hardcoded one from prompt for now if env is missing, though user should replace password)
  console.warn("MONGODB_URI is not set in environment variables.");
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;

// Helper function to get DB instance
export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db("better-imdb");
}

export interface CreateUserParams {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

// DB Accessors for Auth (Converted to Async)

export const createUser = async (user: CreateUserParams): Promise<CreateUserParams> => {
  const db = await getDb();
  await db.collection<User>('users').insertOne({
    id: user.id,
    name: user.name || null,
    email: user.email || null,
    image: user.image || null,
    copilot_token: null,
    created_at: new Date()
  });
  return user;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const db = await getDb();
  const user = await db.collection<User>('users').findOne({ email });
  return user;
};

export const getUserById = async (id: string): Promise<User | null> => {
  const db = await getDb();
  const user = await db.collection<User>('users').findOne({ id });
  return user;
};

export const updateUserCopilotToken = async (userId: string, token: string): Promise<UpdateResult> => {
  const db = await getDb();
  return db.collection<User>('users').updateOne(
    { id: userId },
    { $set: { copilot_token: token } }
  );
};
