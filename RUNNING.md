set -a; source .env; set +a
caffeinate -i ./venv/bin/python server.py

====================

npx next build --no-lint && npx next start    # for testers/demo: fast; rebuild after every code change
                                              # (no code change since the last build: npx next start)

npm run dev                                   # only while editing code (slow over the internet)

====================

Public address (permanent): https://hr-analysis.tailcbe27e.ts.net
Tailscale Funnel forwards it to localhost:3000. It starts with the Mac (brew service)
and comes back by itself: no tunnel command, APP_URL never changes.
  tailscale funnel status          # check it
  tailscale funnel --bg 3000       # turn it back on if it was switched off
  tailscale funnel --https=443 off # stop public access
