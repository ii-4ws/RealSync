2. Install Dependencies

cd *file_path*Front-End
npm install

cd file_path../realsync-backend
npm install

cd file_path../RealSync-AI-Prototype
pip install -r requirements.txt

3. Create Environment Files

Create Front-End/.env:

VITE_SUPABASE_URL=https://quoanhdzcplrxnwnewct.supabase.co

VITE_SUPABASE_ANON_KEY=ADD_YOUR_KEY

VITE_PROTOTYPE_MODE=0

Create realsync-backend/.env:

SUPABASE_URL=https://quoanhdzcplrxnwnewct.supabase.co

SUPABASE_SERVICE_KEY=ADD_YOUR_KEY

REALSYNC_BOT_MODE=stub

4. Run the App

chmod +x start.sh
./start.sh

That's it — one command starts all 3 services (Frontend on :3000, Backend on :4000, AI Service on :5100). Press Ctrl+C to stop everything.

5. Open in Browser
Go to http://localhost:3000

You should see the login screen. Sign up with a corporate/institutional email (personal emails like Gmail/Yahoo are blocked). Or if you just want to see the UI without auth, change VITE_PROTOTYPE_MODE=1 in Front-End/.env.

Ports:

Frontend: http://localhost:3000
Backend: http://localhost:4000
AI Service: http://localhost:5100

Requirements: Node.js 18+, Python 3.10+
