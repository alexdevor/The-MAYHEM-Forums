# Deploy The MAYHEM Forum on Render.com

## 1. Prepare your project
- Make sure all files (including `mayhem.db`) are in your project folder.
- Your backend is Node.js + Express, so you need a Node.js host (Render, Railway, Heroku, etc).

## 2. Create a GitHub repository
- Push your project folder to a new GitHub repo (or use Render's direct upload).

## 3. Deploy on Render.com
1. Go to [Render.com](https://render.com) and sign up.
2. Click "New Web Service" and connect your repo or upload your code.
3. Set the build command to:
   ```
   npm install
   ```
4. Set the start command to:
   ```
   node server.js
   ```
5. Choose Node version 16+.
6. Click "Create Web Service".
7. Wait for deployment. Render will give you a public URL.

## 4. Database
- `mayhem.db` (SQLite) will be stored locally on the server. For production, consider using a cloud database (like PostgreSQL) for reliability.

## 5. Notes
- If you want to use a cloud database, update your code to use the new connection string.
- For persistent file uploads, use a cloud storage service (like AWS S3) instead of local `public/uploads`.

## 6. Troubleshooting
- If you see errors, check the Render logs for missing dependencies or port issues.
- Make sure your `package.json` includes all dependencies and a start script.

---

**Enjoy your public forum!**
