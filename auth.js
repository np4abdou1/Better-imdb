import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Credentials from "next-auth/providers/credentials"
import { createUser, getUserByEmail, getUserById, getDb } from "./lib/db"
import { authConfig } from "./auth.config.js"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    GitHub,
    Credentials({
      id: 'test-login',
      name: 'Test Login',
      credentials: {},
      async authorize() {
        // Return test user
        const testUser = await getUserById('test-user-123');
        if (testUser) {
          return {
            id: testUser.id,
            name: testUser.name,
            email: testUser.email,
            image: testUser.image
          };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Skip database checks for test login
      if (account?.provider === 'test-login') {
        return true;
      }
      
      if (!user.email) return false;
      
      try {
        const existingUser = await getUserByEmail(user.email);
        
        if (!existingUser) {
          // Create new user
          await createUser({
            id: user.id, 
            name: user.name,
            email: user.email,
            image: user.image
          });
          
          // Create default lists for new user
          const defaultLists = ['Watched', 'Watching', 'To Watch', 'Favorites'];
          const db = await getDb();
          const listsCollection = db.collection('lists');
          
          await listsCollection.insertMany(defaultLists.map(name => ({
            user_id: user.id,
            name,
            created_at: new Date()
          })));
        }
        return true;
      } catch (error) {
        console.error("Sign in error:", error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        // On sign in, align token ID with Database ID
        if (user.email) {
            const dbUser = await getUserByEmail(user.email);
            if (dbUser) {
               token.sub = dbUser.id;
            } else {
               token.sub = user.id;
            }
        } else {
             token.sub = user.id;
        }
      }
      return token;
    }
  }
})
