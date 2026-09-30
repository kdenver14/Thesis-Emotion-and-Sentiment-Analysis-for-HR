# create

 npx tsx scripts/create-admin.ts blastasia.hr.app+johnadmin@gmail.com "Admin John" Passw0rd! MANAGER

# promote (email must already exist)

npx tsx scripts/promote.ts blastasia.hr+denver@gmail.com MANAGER

# delete

npx tsx scripts/delete-admin.ts blastasia.hr.app+john@gmail.com --yes

============================================

1. Terminal A — tunnel (URL is new every launch):
   cloudflared tunnel --url http://localhost:3000
   copy the new https://...trycloudflare.com.
2. Edit ai-video-sentiment-web/.env → set APP_URL= that new tunnel URL.
3. Terminal B — dev server:
   cd ~/Desktop/thesis/ai-video-sentiment-web && npm run dev
4. Open the tunnel URL in the browser, log in, use it.
