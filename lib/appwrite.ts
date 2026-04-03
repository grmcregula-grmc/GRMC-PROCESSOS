import { Client, Account, Databases, Storage } from 'appwrite';

let client: Client | null = null;
let account: Account | null = null;
let databases: Databases | null = null;
let storage: Storage | null = null;

export function getAppwriteClient() {
  if (!client) {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

    if (!projectId) {
      throw new Error('NEXT_PUBLIC_APPWRITE_PROJECT_ID is required in the Secrets panel.');
    }

    client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId);
  }
  return client;
}

export function getAccount() {
  if (!account) {
    account = new Account(getAppwriteClient());
  }
  return account;
}

export function getDatabases() {
  if (!databases) {
    databases = new Databases(getAppwriteClient());
  }
  return databases;
}

export function getStorage() {
  if (!storage) {
    storage = new Storage(getAppwriteClient());
  }
  return storage;
}
